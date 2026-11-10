"""Effects released by individual, consumed wheel grants. No external calls on import."""
from __future__ import annotations

import hashlib
import hmac
import base64
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import uuid
import urllib.parse
import urllib.request

from safety import Safety
from factory import BOARD, CHECK, QUEUE, OWNER, guide_has_personal_steps, normalize_guide


def node_environment():
    allowed = {
        "PATH","PATHEXT","SYSTEMROOT","WINDIR","SYSTEMDRIVE","COMSPEC","TEMP","TMP","TMPDIR",
        "USERPROFILE","HOMEDRIVE","HOMEPATH","APPDATA","LOCALAPPDATA","PROGRAMFILES",
        "PROGRAMFILES(X86)","PROGRAMDATA","LANG","USER","USERNAME","OS"
    }
    env = {key:value for key,value in os.environ.items() if key.upper() in allowed}
    bootstrap = Path(__file__).with_name("wheel_node_bootstrap.mjs").read_bytes()
    preload = "data:text/javascript;base64,"+base64.b64encode(bootstrap).decode("ascii")
    env.update(CI="1", EXPO_NO_TELEMETRY="1", EXPO_OFFLINE="1", NODE_ENV="test",
               NODE_OPTIONS="--preserve-symlinks --preserve-symlinks-main --import="+preload)
    return env


def _relative(name):
    if not isinstance(name, str) or not name or len(name) > 260 or any(
        part in ("", ".", "..") or part.startswith((".", "-")) for part in name.split("/")
    ) or re.search(r'[\x00-\x1f<>:"\\|?*\[\]]', name):
        raise ValueError("Ruta de archivo fuera del alcance de la autorización.")
    return name


def _assert_route(workspace, relative):
    target = workspace / _relative(relative)
    if target.resolve() != target or not target.is_relative_to(workspace):
        raise ValueError("La ruta contiene un enlace o escapa de la carpeta autorizada.")
    return target


def within_scope(names, scopes):
    return all(any(name == scope or scope.endswith("/") and name.startswith(scope) for scope in scopes)
               for name in names)


class WheelPublication(Safety):
    """Keep existing transaction, commit comparison, push and receipts; trust only fresh checks."""
    def __init__(self, factory, tests):
        super().__init__(factory.bridge, factory.Error, factory.canonical, factory.digest, factory.utc)
        self.tests = tests

    def evidence(self, job):
        if job["state"] != "completed" or not self.tests:
            raise self.Error("WHEEL_CHECKS_MISSING", "Faltan pruebas independientes de este trabajo.")
        return {"tests": self.tests}

    def git_command(self, workspace, *args):
        if args[:1] == ("push",):
            args = ("push", "--no-follow-tags", *args[1:])
        return super().git_command(workspace, "--literal-pathspecs", "-c", "core.hooksPath=NUL",
                                   "-c", "push.recurseSubmodules=no", *args)


class WheelEffects:
    def __init__(self, factory):
        self.f = factory
        self.b = factory.bridge

    def fail(self, code, message):
        raise self.f.Error(code, message)

    def start_branch(self,grant):
        workspace=Path(grant["workspace"])
        branch="codex/factory-a4-"+grant["card_id"][:12]+"-"+str(grant["attempt"])+"-"+grant["grant_id"][:6]
        pub=WheelPublication(self.f,[])
        if pub.git_command(workspace,"branch","--show-current").strip()==branch:
            return branch
        pub.git_command(workspace,"switch","--no-overwrite-ignore","-c",branch)
        return branch

    def preserve_blocked_work(self,grant,reason):
        row=self.f._row(grant["card_id"],grant["attempt"])
        if not row or not row.get("job_id"):
            return
        job,workspace=self._job(row,grant)
        if job["state"] in ("running","detached"):
            self.fail("WHEEL_PRESERVATION_BUSY","La ejecución aún podría escribir en su carpeta.")
        if self._publications(job["id"]):
            self.fail("WHEEL_PRESERVATION_PUBLICATION","Existe una publicación pendiente de conciliación.")
        pub=WheelPublication(self.f,[])
        status=pub.git_command(workspace,"status","--porcelain")
        if not status.strip():
            detail=json.loads(row.get("detail") or "{}")
            detail["blocked_reason"]=reason
            self.f._update(grant["card_id"],grant["attempt"],state="blocked",detail=self.f.canonical(detail))
            return
        if job["state"]=="prepared":
            self.fail("WHEEL_PRESERVATION_SCOPE","La tarea no llegó a ejecutarse; los cambios locales requieren revisión.")
        expected=json.loads(row.get("detail") or "{}").get("work_branch")
        if not expected or pub.git_command(workspace,"branch","--show-current").strip()!=expected:
            self.fail("WHEEL_PRESERVATION_BRANCH","La rama cambió; se conserva el trabajo para revisión.")
        try:
            diff=self._check_files(workspace,grant,pub,validate=False)
        except Exception:
            self.fail("WHEEL_PRESERVATION_SCOPE","Hay cambios fuera del alcance propio que requieren revisión.")
        # A local checkpoint preserves a blocked attempt. It is never pushed or
        # recorded as a successful publication.
        folder=self.b.home/"ejecuciones"/job["id"]/"revision-local"
        folder.mkdir(exist_ok=True)
        (folder/"cambio.patch").write_text(diff,encoding="utf8",newline="\n")
        files=list(filter(None,pub.git_command(workspace,"diff","--name-only","-z","HEAD").split("\0")))
        for relative in files:
            source=_assert_route(workspace,relative)
            if source.is_file():
                target=folder/relative
                target.parent.mkdir(parents=True,exist_ok=True)
                shutil.copyfile(source,target)
        before=pub.git_command(workspace,"rev-parse","HEAD").strip()
        pub.git_command(workspace,"commit","--only","-m","WIP local · revisión "+grant["card_id"],"--",*files)
        checkpoint=pub.git_command(workspace,"rev-parse","HEAD").strip()
        if pub.git_command(workspace,"diff","--binary",before,checkpoint)!=diff:
            self.fail("WHEEL_PRESERVATION_CHANGED","El archivo local de revisión necesita comprobarse.")
        info={"reason":reason,"branch":expected,"checkpoint_sha":checkpoint,"published":False,"files":files,
              "job_id":job["id"],
              "patch_sha256":self.f.digest(diff)}
        (folder/"revision.json").write_text(self.f.canonical(info)+"\n",encoding="utf8")
        detail=json.loads(row.get("detail") or "{}")
        detail["local_review"]=info
        self.f._update(grant["card_id"],grant["attempt"],state="blocked",detail=self.f.canonical(detail))
        self.b.audit("wheel_work_preserved",{"job":job["id"],**info})
        if pub.git_command(workspace,"status","--porcelain").strip():
            self.fail("WHEEL_PRESERVATION_DIRTY","Se ha archivado el cambio propio; hay otros cambios que conservar.")
        pub.git_command(workspace,"fetch","--no-tags","origin","refs/heads/main")
        pub.git_command(workspace,"switch","--no-overwrite-ignore","-c","codex/factory-a4-ready-"+uuid.uuid4().hex[:12],"FETCH_HEAD")

    def _job(self, row, grant):
        job = self.b.job(row["job_id"])
        data, source = job["data"], job["data"].get("source", {})
        path, sandbox = self.b.workspace("4")
        if (row["card_id"] != grant["card_id"] or row["attempt"] != grant["attempt"]
                or row["instruction_sha"] != grant["instruction_sha"]
                or data["instruction_sha256"] != row["instruction_sha"]
                or self.f.digest(data["instruction"]) != grant["instruction_sha"]
                or source.get("source") != "verified-queue" or source.get("card_id") != row["card_id"]
                or source.get("attempt") != row["attempt"] or source.get("board_id") != BOARD
                or source.get("list_id") != QUEUE or data.get("agent") != "4"
                or sandbox != "workspace-write" or Path(grant["workspace"]).resolve() != Path(path).resolve()):
            self.fail("WHEEL_SCOPE_CHANGED", "El trabajo ya no coincide con la autorización.")
        return job, Path(path).resolve()

    def perform(self, letter, row, grant, permit):
        job, workspace = self._job(row, grant)
        if letter == "A":
            state = self.f._git(workspace)
            if state["head"] != row["before_sha"] or state["origin_main"] != row["before_sha"]:
                self.fail("WHEEL_BASE_CHANGED", "MAIN ha avanzado desde la preparación del trabajo.")
            if grant.get("work_kind")!="diagnosis":
                self._dependencies(workspace,row["job_id"])
            payload = self.b.execution_payload(job["id"])
            approval = permit("execute", payload)
            result = self.b.launch(payload, approval)
            return {"job": result["id"], "state": result["state"]}
        if letter == "B":
            if grant.get("work_kind")=="diagnosis":
                return self._diagnosis(row,job,workspace)[0]
            return self._publish(row, grant, job, workspace, permit)
        if letter in ("C", "D"):
            return self._trello(letter, row, grant, job, workspace, permit)
        self.fail("WHEEL_ACTION_UNKNOWN", "La operación no pertenece a esta autorización.")

    def _check_files(self, workspace, grant, pub, *, validate=True):
        allowed = {path if path.endswith("/") else _relative(path) for path in grant["allowed_files"]}
        tracked = set(filter(None, pub.git_command(workspace, "diff", "--name-only", "--no-renames", "-z", "HEAD").split("\0")))
        fresh = set(filter(None, pub.git_command(workspace, "ls-files", "--others", "--exclude-standard", "-z").split("\0")))
        if not tracked | fresh or not within_scope(tracked | fresh,allowed):
            self.fail("WHEEL_PATCH_SCOPE", "El parche es vacío o contiene archivos fuera del alcance autorizado.")
        if validate and any(path.startswith(("artifacts/api-server/","lib/db/","supabase/migrations/")) for path in tracked|fresh):
            self.fail("WHEEL_HOSTED_PROOF_REQUIRED","El parche requiere comprobar el servicio alojado antes de publicarse.")
        if validate and any(re.search(r"^(?:railway\.(?:json|toml)|Dockerfile(?:[./]|$)|(?:infrastructure|terraform)/)|(?:\.pem|\.key)$",path,re.I) for path in tracked|fresh):
            self.fail("WHEEL_INFRASTRUCTURE_SCOPE","Este cambio requiere la revisión específica de infraestructura o secretos.")
        if pub.git_command(workspace, "diff", "--cached", "--name-only"):
            self.fail("WHEEL_INDEX_BUSY", "Existe trabajo preparado en el índice.")
        for name in tracked | fresh:
            target = _assert_route(workspace, name)
            if target.exists() and (not target.is_file() or target.stat().st_size > 1024 * 1024):
                self.fail("WHEEL_PATCH_SIZE", "El cambio necesita revisión por tamaño o tipo.")
        if fresh:
            # Checked against the grant and initially clean pre-execution worktree.
            # Intent-to-add exposes the new file to the existing exact patch procedure.
            pub.git_command(workspace, "add", "--intent-to-add", "--", *sorted(fresh))
        if validate:
            pub.git_command(workspace, "diff", "--check", "HEAD")
        raw_modes = pub.git_command(workspace, "diff", "--raw", "--no-renames", "HEAD")
        if any(line.startswith((":120000", ":160000")) or re.match(r"^:\d+ (120000|160000)", line)
               for line in raw_modes.splitlines()):
            self.fail("WHEEL_PATCH_LINK", "Un enlace o submódulo necesita revisión fuera del ciclo normal.")
        return pub.git_command(workspace, "diff", "--binary", "HEAD")

    def _dependencies(self,workspace,job_id):
        mobile = workspace/"artifacts/go-app-mobile"
        lock = workspace/"pnpm-lock.yaml"
        if not (mobile/"package.json").is_file() or not lock.is_file():
            self.fail("WHEEL_DEPENDENCIES","No se reconoce el workspace PNPM de la aplicación.")
        required = (mobile/"node_modules/typescript/bin/tsc",mobile/"node_modules/expo/bin/cli")
        installed=all(path.is_file() for path in required)
        marker=workspace/"node_modules/.pnpm/.wheel-private-import.json"
        if marker.resolve()!=marker:
            self.fail("WHEEL_DEPENDENCIES_SHARED","El estado de importación de paquetes está fuera del worktree.")
        try:
            import_incomplete=marker.is_file() and json.loads(marker.read_text(encoding="utf8")).get("state")=="in_progress"
        except (ValueError,OSError):
            import_incomplete=True
        if installed and not import_incomplete and self._readable_packages(workspace,required):
            return
        # Only repair the isolated agent workspace, with its existing cache and lockfile.
        if any(not path.resolve().is_relative_to(workspace) for path in (workspace/"node_modules",mobile/"node_modules")):
            self.fail("WHEEL_DEPENDENCIES_SHARED","Los paquetes están enlazados a otra carpeta.")
        probe = subprocess.run(["powershell.exe","-NoProfile","-NonInteractive","-Command",
            "(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object {$_.CommandLine -match 'pnpm.*\\binstall\\b'} | Measure-Object).Count"],
            capture_output=True,text=True,timeout=20)
        if probe.returncode or probe.stdout.strip()!="0":
            self.fail("WHEEL_INSTALL_BUSY","No se puede descartar otra instalación PNPM activa.")
        if installed:
            # PNPM's shared store can supply hard links with owner-only ACLs.
            # Use private identical copies in this worktree. The store and the
            # other agents' links/permissions are never changed.
            count=self._private_import(workspace)
            self.b.audit("wheel_private_package_import",{"job":job_id,"files":count})
            if not self._readable_packages(workspace,required):
                self.fail("WHEEL_DEPENDENCIES","El sandbox todavía no puede leer las dependencias privadas del agente.")
            return
        pnpm=shutil.which("pnpm.cmd")
        cli=Path(pnpm).parent/"node_modules/pnpm/bin/pnpm.cjs" if pnpm else None
        node=shutil.which("node.exe")
        if not node or not cli or not cli.is_file():
            self.fail("WHEEL_DEPENDENCIES","No se encontró PNPM local para recuperar el lockfile sin red.")
        original=lock.read_bytes()
        logdir=self.b.home/"ejecuciones"/job_id
        logdir.mkdir(exist_ok=True)
        with (logdir/("rueda-dependencias-"+uuid.uuid4().hex[:8]+".log")).open("xb") as log:
            try:
                result=subprocess.run([self.b.config["codex_executable"],"sandbox","--include-managed-config","-C",str(workspace),"-P",":workspace",
                    "--",node,str(cli),"install","--offline","--frozen-lockfile","--ignore-scripts","--ignore-pnpmfile",
                    "--config.package-import-method=copy"],
                    cwd=workspace,env=node_environment(),stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,timeout=600)
            except subprocess.TimeoutExpired:
                self.fail("WHEEL_INSTALL_UNCERTAIN","PNPM excedió el plazo; se conserva su estado para revisar el proceso.")
        if result.returncode or original!=lock.read_bytes() or not all(path.is_file() for path in required):
            self.fail("WHEEL_DEPENDENCIES","La recuperación offline no completó las dependencias; consulta el registro de este intento.")

    def _readable_packages(self,workspace,required):
        node=shutil.which("node.exe" if os.name=="nt" else "node")
        probe="const fs=require('fs');for(const p of process.argv.slice(1)){try{fs.readFileSync(p)}catch(e){process.exit(['EPERM','EACCES'].includes(e.code)?42:1)}}"
        if not node:
            self.fail("WHEEL_DEPENDENCIES","No se encontró Node.")
        result=subprocess.run([self.b.config["codex_executable"],"sandbox","--include-managed-config","-C",str(workspace),"-P",":workspace","--",
                               node,"-e",probe,*map(str,required)],env=node_environment(),capture_output=True,timeout=30)
        if result.returncode not in (0,42):
            self.fail("WHEEL_SANDBOX_UNAVAILABLE","No se pudo verificar el entorno aislado de las pruebas.")
        return result.returncode==0

    def _private_import(self,workspace):
        store=workspace/"node_modules"/".pnpm"
        if store.resolve()!=store or not store.is_dir():
            self.fail("WHEEL_DEPENDENCIES_SHARED","El almacén instalado no es privado de este worktree.")
        lock=store/".wheel-import.lock"
        if lock.resolve()!=lock:
            self.fail("WHEEL_DEPENDENCIES_SHARED","El bloqueo de paquetes no pertenece a este worktree.")
        import msvcrt
        with lock.open("a+b") as stream:
            if not stream.seek(0,2):
                stream.write(b"0")
                stream.flush()
            stream.seek(0)
            try:
                msvcrt.locking(stream.fileno(),msvcrt.LK_NBLCK,1)
            except OSError:
                self.fail("WHEEL_INSTALL_BUSY","Ya existe una recuperación de paquetes en esta carpeta.")
            try:
                return self._import_packages(workspace)
            finally:
                stream.seek(0)
                msvcrt.locking(stream.fileno(),msvcrt.LK_UNLCK,1)

    def _import_packages(self,workspace):
        store=workspace/"node_modules"/".pnpm"
        if store.resolve()!=store or not store.is_dir():
            self.fail("WHEEL_DEPENDENCIES_SHARED","El almacén instalado no es privado de este worktree.")
        marker=store/".wheel-private-import.json"
        if marker.resolve()!=marker:
            self.fail("WHEEL_DEPENDENCIES_SHARED","El estado de importación de paquetes está fuera del worktree.")
        marker.write_text(json.dumps({"state":"in_progress"}),encoding="utf8")
        count=0
        for parent,dirs,names in os.walk(store):
            dirs[:]=[name for name in dirs if (Path(parent)/name).resolve()==Path(parent)/name]
            for name in names:
                file=Path(parent)/name
                before=file.stat(follow_symlinks=False)
                if before.st_nlink<=1 or file.is_symlink() or not file.is_file():
                    continue
                with tempfile.NamedTemporaryFile(dir=parent,prefix=".wheel-import-",delete=False) as output:
                    temp=Path(output.name)
                try:
                    # copyfile copies bytes, not the source file's security descriptor.
                    shutil.copyfile(file,temp)
                    after=file.stat(follow_symlinks=False)
                    if ((before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_ino,after.st_size,after.st_mtime_ns)
                            or temp.stat().st_size!=before.st_size):
                        self.fail("WHEEL_INSTALL_BUSY","Un paquete cambió durante la importación privada.")
                    os.replace(temp,file)
                    count+=1
                finally:
                    temp.unlink(missing_ok=True)
        marker.write_text(json.dumps({"state":"completed","files":count}),encoding="utf8")
        return count

    def _test_files(self, grant, workspace):
        mobile = workspace / "artifacts" / "go-app-mobile"
        files = []
        selected=list(grant["test_files"])
        changed=self.b.safety.git_command(workspace,"diff","--name-only","-z","HEAD").split("\0")
        changed+=self.b.safety.git_command(workspace,"ls-files","--others","--exclude-standard","-z").split("\0")
        selected+=sorted(path for path in set(changed) if path.endswith(".test.mjs") and
                         path.startswith("artifacts/go-app-mobile/tests/") and within_scope([path],grant["allowed_files"]))
        for approved in dict.fromkeys(selected):
            path = _relative(approved)
            prefix = "artifacts/go-app-mobile/"
            relative = path[len(prefix):] if path.startswith(prefix) else path
            if not relative.startswith("tests/") or not relative.endswith(".test.mjs"):
                self.fail("WHEEL_TEST_SCOPE", "Debe seleccionarse una prueba Node de la aplicación.")
            if not _assert_route(mobile, relative).is_file():
                self.fail("WHEEL_TEST_MISSING", "No se encuentra una prueba acordada.")
            files.append(relative)
        if not files:
            self.fail("WHEEL_TEST_MISSING", "Faltan pruebas dirigidas para esta tarjeta.")
        return files

    def _recovery(self, job):
        path=self.b.home/"ejecuciones"/job["id"]/"revision-local"/"validacion-recuperada.json"
        if not path.is_file():
            return None
        try:
            record=json.loads(path.read_text(encoding="utf8"));doc=record["receipt"]
            valid=hmac.compare_digest(self.b.sign(doc),record["mac"])
            valid=valid and doc["job"]==job["id"] and doc["instruction_sha"]==job["data"]["instruction_sha256"]
        except (ValueError,KeyError,TypeError):
            valid=False
        if not valid:
            self.fail("WHEEL_RECOVERY_INVALID","La revisión recuperada no tiene una firma válida.")
        return doc

    def _tests(self, row, grant, workspace):
        job=self.b.job(row["job_id"])
        recovery=self._recovery(job)
        if recovery:
            pub=WheelPublication(self.f,[])
            events=self.b.home/"ejecuciones"/row["job_id"]/"eventos.jsonl"
            valid=(recovery["base_sha"]==row["before_sha"] and recovery["instruction_sha"]==grant["instruction_sha"]
                   and pub.git_command(workspace,"rev-parse","HEAD").strip()==row["before_sha"]
                   and self.f.digest(pub.git_command(workspace,"diff","--binary","HEAD"))==recovery["patch_sha256"]
                   and hashlib.sha256(events.read_bytes()).hexdigest()==recovery["events_sha256"])
            for name,sha in recovery["files"].items():
                valid=valid and hashlib.sha256(_assert_route(workspace,name).read_bytes()).hexdigest()==sha
            checks=recovery["tests"]
            if not valid or {r.get("check") for r in checks}!={"test","typescript","ios"} or not all(r.get("passed") is True for r in checks):
                self.fail("WHEEL_RECOVERY_CHANGED","El parche o las pruebas recuperadas han cambiado; no se reutilizan.")
            self.b.audit("wheel_verified_tests_reused",{"job":row["job_id"],"receipt_sha":self.f.digest(self.f.canonical(recovery))})
            return checks
        mobile = workspace / "artifacts" / "go-app-mobile"
        files = self._test_files(grant, workspace)
        node = shutil.which("node.exe" if os.name == "nt" else "node")
        tsc = mobile / "node_modules/typescript/bin/tsc"
        expo = mobile / "node_modules/expo/bin/cli"
        if not node or not tsc.is_file() or not expo.is_file():
            self.fail("WHEEL_DEPENDENCIES", "No están disponibles Node, TypeScript o Expo del lockfile.")
        checks = [("test", ["--test", *files]),
                  ("typescript", [str(tsc), "-p", "tsconfig.json", "--noEmit", "--incremental", "false"]),
                  ("ios", [str(expo), "export", "--platform", "ios", "--output-dir",
                           str(mobile / ".expo" / ("wheel-ios-" + row["job_id"])), "--max-workers", "1"])]
        env = node_environment()
        # The tested subprocess uses the installed Codex filesystem and network sandbox.
        # No model invocation, shell command from Trello, Git token or bridge secret is used.
        executable = self.b.config["codex_executable"]
        receipts = []
        log_root = self.b.home / "ejecuciones" / row["job_id"]
        run_id=uuid.uuid4().hex[:8]
        for label, args in checks:
            self.b.ensure_sandbox_helper_acl()
            env["NODE_ENV"]="production" if label=="ios" else "test"
            command = [executable, "sandbox", "--include-managed-config", "-C", str(mobile), "-P", ":workspace", "--", node,*args]
            log = log_root / ("rueda-" + label + "-"+run_id+".log")
            with log.open("wb") as output:
                try:
                    result = subprocess.run(command, env=env, stdin=subprocess.DEVNULL, stdout=output,
                                            stderr=subprocess.STDOUT, timeout=1200, cwd=mobile,
                                            creationflags=0x08000000 if os.name == "nt" else 0)
                except subprocess.TimeoutExpired:
                    self.fail("WHEEL_VALIDATION_UNCERTAIN","La comprobación excedió su plazo; revisa sus procesos antes de continuar.")
            receipt = {"check":label,"exit":result.returncode,"log":log.name,"log_sha256":hashlib.sha256(log.read_bytes()).hexdigest(),
                       "passed":result.returncode == 0}
            receipts.append(receipt)
            self.b.audit("wheel_test_result", {"job":row["job_id"], **receipt})
            if result.returncode:
                self.fail("WHEEL_TEST_FAILED", "Falló la comprobación " + label + "; se conservaron los resultados.")
        return receipts

    def _publish(self, row, grant, job, workspace, permit):
        if grant["backend_required"]:
            self.fail("WHEEL_HOSTED_PROOF_REQUIRED", "Esta tarjeta requiere acreditar el circuito autorizado en el backend alojado.")
        if job["state"] not in ("completed","awaiting_validation") or (job.get("result") or {}).get("exit_code") != 0:
            self.fail("WHEEL_JOB_NOT_COMPLETE", "La ejecución no ha terminado satisfactoriamente.")
        if self._publications(job["id"]):
            self.fail("WHEEL_PRIOR_PUBLICATION", "Ya existe una operación Git que requiere conciliación.")
        self._validation(job)
        pub = WheelPublication(self.f, [])
        if pub.git_command(workspace, "remote", "get-url", "--push", "--all", "origin").strip() not in (
            "https://github.com/goappdev01/goapp","https://github.com/goappdev01/goapp.git",
            "git@github.com:goappdev01/goapp.git","git@github.com:goappdev01/goapp"):
            self.fail("WHEEL_GIT_DESTINATION", "El destino efectivo del push cambió.")
        initial = self.b.git_state(workspace, check_main=True)
        if initial["head"] != row["before_sha"]:
            self.fail("WHEEL_BASE_CHANGED", "El parche ya no parte de la revisión autorizada.")
        diff = self._check_files(workspace, grant, pub)
        pub.tests = self._tests(row, grant, workspace)
        if job["state"]=="awaiting_validation":
            self.b.finish_job(job["id"],"completed",{**job["result"],"independent_tests":pub.tests,
                "validation_status":"passed","classification_reason":"Las pruebas independientes del coordinador han pasado."})
        payload = pub.publication_payload(job["id"])
        if payload["diff"] != diff or not within_scope(payload["files"],grant["allowed_files"]):
            self.fail("WHEEL_PATCH_CHANGED", "Los archivos cambiaron durante las pruebas.")
        out = pub.publish(payload, permit("publish-main", payload))
        if out["state"] != "verified":
            self.fail("WHEEL_PUBLICATION_UNCERTAIN", "Se requiere conciliar la operación Git antes de continuar.")
        return self._published(row, workspace, sync=True)

    def _publications(self, job_id):
        with self.b.db() as db:
            return [dict(item) for item in db.execute("SELECT * FROM operations WHERE action='publish-main'")
                    if json.loads(item["payload"]).get("job") == job_id]

    def _reconcile_publication(self,row,grant,workspace):
        publications=self._publications(row["job_id"])
        if len(publications)!=1:
            return False
        op=publications[0]
        if op["state"]=="verified":
            return True
        if op["state"] not in ("sending","unknown","needs_review"):
            return False
        with self.b.db() as db:
            approval=db.execute("SELECT a.* FROM approvals a JOIN wheel_stages s ON s.approval_id=a.id "
                "WHERE s.grant_id=? AND s.letter='B' AND a.used IS NOT NULL",(grant["grant_id"],)).fetchone()
        if not approval:
            return False
        actor=json.loads(approval["actor"])
        payload=json.loads(op["payload"])
        signed={"id":approval["id"],"action":approval["action"],"payload":json.loads(approval["payload"]),
                "actor":{key:value for key,value in actor.items() if key!="origin"},
                "created":approval["created"],"origin":actor.get("origin")}
        if (approval["action"]!="publish-main" or signed["payload"]!=payload or
                actor.get("origin")!="wheel:"+grant["grant_id"]+":B" or
                not hmac.compare_digest(self.b.sign(signed),approval["mac"])):
            self.fail("WHEEL_GRANT_INTEGRITY","La publicación incierta no tiene un permiso firmado válido.")
        git=lambda *args:self.b.safety.git_command(workspace,*args)
        sha=git("rev-parse","HEAD").strip()
        if (payload.get("remote_main")!=row["before_sha"] or payload.get("target")!="origin/main" or
                not within_scope(payload.get("files",[]),grant["allowed_files"]) or
                git("rev-parse",sha+"^").strip()!=row["before_sha"] or
                git("log","-1","--format=%B",sha).strip()!=payload["message"].strip() or
                git("diff","--binary",row["before_sha"],sha)!=payload["diff"] or
                git("ls-remote","origin","refs/heads/main").split()[0]!=sha):
            return False
        result={"main_sha":sha,"tests_verified":True,"reconciled":True,
                "metro":"pending-independent-verification","iphone":"pending-owner-validation"}
        with self.b.db() as db:
            db.execute("UPDATE operations SET state='verified',result=? WHERE id=?",
                       (self.f.canonical(result),op["id"]))
            self.b.audit("wheel_publication_reconciled",{"operation":op["id"],"main_sha":sha,
                                                       "repeated_push":False},db)
        return True

    def _validation(self, job):
        recovery=self._recovery(job)
        response = (job.get("result") or {}).get("response", "")
        records = re.findall(r"^GO_FACTORY_EVIDENCE:\s*(\{[^\n]*\})\s*$", response, re.M)
        try:
            lines = recovery["validation"] if recovery else json.loads(records[0])["validation"] if len(records)==1 else []
        except (ValueError, TypeError, KeyError):
            lines = []
        lines = normalize_guide(lines)
        if not guide_has_personal_steps(lines) or any(
                re.search(r"@|://|\[GO-Puente|(?:bearer|password|token|credencial|clave privada)|[0-9a-f]{32,}", line, re.I)
                for line in lines):
            self.fail("WHEEL_GUIDE_INVALID", "La guía de iPhone debe indicar dónde entrar, qué hacer y qué resultado esperar, sin información privada.")
        return lines

    def _diagnosis(self, row, job, workspace):
        result = job.get("result") or {}
        state = self.b.git_state(workspace,check_main=True)
        remote_compatible=state.get('origin_main')==row['before_sha']
        if not remote_compatible:
            # A bridge-only publication cannot invalidate the inspected GO sources.
            # Any application change still requires a separate reviewed diagnosis.
            ancestor=subprocess.run(['git','-C',str(workspace),'merge-base','--is-ancestor',
                                     row['before_sha'],str(state.get('origin_main'))],capture_output=True,timeout=15)
            delta=subprocess.run(['git','-C',str(workspace),'diff','--name-only',row['before_sha'],
                                  str(state.get('origin_main'))],capture_output=True,text=True,timeout=15)
            remote_compatible=(ancestor.returncode==0 and delta.returncode==0 and bool(delta.stdout.strip())
                               and all(p.startswith('tools/go-codex-bridge/') for p in delta.stdout.splitlines()))
        if (state.get("tracked_dirty") or state.get("head")!=row["before_sha"]
                or not remote_compatible or self._publications(job["id"])):
            self.fail("WHEEL_DIAGNOSIS_WORKSPACE_CHANGED","El diagnóstico ya no coincide con la base limpia y sin publicación.")
        if (job["state"] not in ("completed","awaiting_validation","blocked") or result.get("exit_code")!=0
                or result.get("turn_completed") is not True or result.get("file_change_events")!=0
                or result.get('policy_errors') or result.get('credit_limited')):
            self.fail("WHEEL_DIAGNOSIS_UNVERIFIED","El diagnóstico debe terminar sin ediciones y con el registro completo.")
        fields = {"working":"Funciona realmente","inactive":"Programado y pendiente de funcionar",
                  "missing":"Falta por programar","changes":"Cambios mínimos propuestos"}
        records = re.findall(r"^GO_FACTORY_DIAGNOSIS:\s*(\{[^\n]*\})\s*$",result.get("response",""),re.M)
        try:
            report = json.loads(records[0]) if len(records)==1 else {}
            raw = (self.b.home/"ejecuciones"/job["id"]/"eventos.jsonl").read_text(encoding="utf-8")
            events = [json.loads(line) for line in raw.splitlines()]
        except (ValueError, OSError):
            self.fail("WHEEL_DIAGNOSIS_UNVERIFIED","Falta el informe estructurado o su registro de ejecución.")
        if not isinstance(report,dict) or set(report)!=set(fields)|{"checks"}:
            self.fail("WHEEL_DIAGNOSIS_UNVERIFIED","El informe no cubre las cuatro secciones solicitadas.")
        if any(not isinstance(report[key],str) or not 10<=len(report[key].strip())<=950 or re.search(
                r"@|://|[\x00-\x1f]|\[GO-Puente|(?:bearer|password|token|credencial|clave privada)|\b\d{8,}\b|[0-9a-f]{24,}",report[key],re.I)
                for key in fields):
            self.fail("WHEEL_DIAGNOSIS_UNVERIFIED","El informe no es apto para compartir sin datos privados.")
        commands = []
        for event in events:
            item = event.get("item") or {}
            if (event.get("type")=="item.completed" and item.get("type")=="command_execution"
                    and item.get("status")=="completed" and item.get("exit_code")==0):
                commands.append((item.get("command") or item.get("cmd"), str(item.get("aggregated_output") or "")))
        checks = report["checks"]
        if not isinstance(checks,list) or not 1<=len(checks)<=12 or not all(
                isinstance(check,dict) and set(check)=={"command","observed"}
                and isinstance(check["observed"],str) and 3<=len(check["observed"].strip())<=250
                and any(check["command"]==command and check["observed"] in output for command,output in commands)
                for check in checks):
            self.fail("WHEEL_DIAGNOSIS_UNVERIFIED","Las comprobaciones del informe no coinciden con la salida registrada.")
        text = "\n\n".join(f"{label}\n{report[key].strip()}" for key,label in fields.items())
        guide = self._validation(job)
        pending_real=job['state']=='blocked' or result.get("reported_status")=="blocked" or result.get("real_validation")=="pending"
        if pending_real:
            text+="\n\nPENDIENTE DE COMPROBACIÓN REAL. El informe acredita la inspección registrada; quedan pendientes las pruebas alojadas entre sesiones autorizadas."
        return {"kind":"diagnosis","real_validation":"pending" if pending_real else "not_claimed",
                "base_sha":state["head"],"report_sha256":self.f.digest(text),
                "guide_sha256":self.f.digest(self.f.canonical(guide)),
                "events_sha256":self.f.digest(raw),"checks":len(checks),"publication":"not_applicable"},text

    def _published(self,row,workspace,sync=False):
        publications = self._publications(row["job_id"])
        if len(publications)!=1 or publications[0]["state"]!="verified":
            self.fail("PUBLICATION_UNCERTAIN","Falta una publicación única confirmada.")
        op = publications[0]
        payload, result = json.loads(op["payload"]), json.loads(op["result"])
        sha = result.get("main_sha","")
        git = lambda *args: self.b.safety.git_command(workspace,*args)
        if (not re.fullmatch("[a-f0-9]{40}",sha) or git("ls-remote","origin","refs/heads/main").split()[0]!=sha
                or git("rev-parse",sha+"^").strip()!=row["before_sha"]
                or git("diff","--binary",row["before_sha"],sha)!=payload["diff"]):
            self.fail("PUBLICATION_UNVERIFIED","MAIN ya no corresponde al parche exacto de esta tarjeta.")
        metro = self.f._verify_metro(sha,row["before_sha"],workspace,synchronize=sync)
        return {"main_sha":sha,"tests":payload["tests"],"metro":metro,
                "api":metro.get("api","Sin comprobación"),"operation":op["id"]}

    def _snapshot(self,card_id):
        card = self.b.api("/1/cards/"+card_id,{"fields":"id,idBoard,idList,shortLink,pos,closed"})
        if (card.get("id")!=card_id or card.get("idBoard")!=BOARD or card.get("closed")
                or not isinstance(card.get("pos"),(int,float))):
            self.fail("WHEEL_TRELLO_CONTEXT","La tarjeta no coincide con su tablero o posición.")
        snapshot = self.b.read_card("https://trello.com/c/"+card["shortLink"],archive=False)["data"]
        if (snapshot["card"]["id"]!=card_id or snapshot["card"]["idList"]!=card["idList"] or
                snapshot["card"].get("desc") or
                not all(snapshot["verification"].get(k) for k in ("stable_during_read","pagination_exhausted"))):
            self.fail("WHEEL_TRELLO_CHANGED","La tarjeta cambió durante la lectura.")
        return card,snapshot["comments"]

    def _trello_receipt(self,letter,row,grant,op,*,comment_list=QUEUE):
        record = json.loads(op["payload"])
        card,comments = self._snapshot(grant["card_id"])
        if record["payload"].get("card_id")!=card["id"]:
            self.fail("WHEEL_OPERATION_MISMATCH","La operación pertenece a otra tarjeta.")
        if letter=="C":
            matches=[c for c in comments if c["text"]==record["payload"]["text"] and c["creatorId"]==OWNER]
            if len(matches)!=1 or card["idList"]!=comment_list:
                self.fail("WHEEL_COMMENT_UNVERIFIED","No se pudo verificar el comentario exacto en la lista esperada.")
            return {"operation":op["id"],"comment_id":matches[0]["id"],"text_sha256":self.f.digest(matches[0]["text"])}
        if card["idList"]!=CHECK or record["payload"].get("list_id")!=CHECK:
            self.fail("WHEEL_MOVE_UNVERIFIED","No se confirmó la tarjeta en COMPROBAR.")
        originals = self.f.original_comments(card["id"],comments)
        if ([comment["id"] for comment in originals]!=grant["comment_ids"] or
                self.f.digest("\n\n".join(comment["text"] for comment in originals))!=grant["instruction_sha"]):
            self.fail("WHEEL_TRELLO_CHANGED","Cambió la instrucción original tras el traslado.")
        comment_ops = self._operations(row,"comment")
        if (len(comment_ops)!=1 or self._trello_receipt("C",row,grant,comment_ops[0],comment_list=CHECK)
                !=self._prior_stage(grant,"C")):
            self.fail("WHEEL_COMMENT_UNVERIFIED","El comentario exacto no se conservó en COMPROBAR.")
        for list_id,count in ((QUEUE,0),(CHECK,1)):
            entries=self.b.api("/1/lists/"+list_id+"/cards",{"fields":"id,idBoard,idList,pos","filter":"open","limit":1000})
            if not isinstance(entries,list) or len(entries)>=1000:
                self.fail("WHEEL_MOVE_UNVERIFIED","No se obtuvo la lista completa después del traslado.")
            matches=[item for item in entries if item.get("id")==card["id"]]
            if len(matches)!=count or (matches and (matches[0].get("pos")!=card["pos"] or matches[0].get("idBoard")!=BOARD)):
                self.fail("WHEEL_MOVE_UNVERIFIED","No se confirmó una única tarjeta en la posición de destino.")
        return {"operation":op["id"],"card_id":card["id"],"board":BOARD,"list_id":CHECK,"position":card["pos"]}

    def _operations(self,row,action):
        with self.b.db() as db:
            return [dict(op) for op in db.execute("SELECT * FROM operations WHERE action=? AND state!='cancelled-before-release'",(action,))
                    if json.loads(op["payload"]).get("context",{}).get("job")==row["job_id"]]

    def cancel_before_release(self,letter,row):
        if letter=="A":
            return self.b.job(row["job_id"])["state"]=="prepared"
        if letter=="B":
            return not self._publications(row["job_id"])
        operations=self._operations(row,"comment" if letter=="C" else "move")
        if any(op["state"]!="prepared" for op in operations):
            return False
        with self.b.db() as db:
            for op in operations:
                db.execute("UPDATE operations SET state='cancelled-before-release' WHERE id=? AND state='prepared'",(op["id"],))
                self.b.audit("wheel_prepared_effect_cancelled",{"operation":op["id"],"reason":"owner-pause"},db)
        return True

    def _trello(self,letter,row,grant,job,workspace,permit):
        prior = self._prior_stage(grant,"B")
        diagnosis = grant.get("work_kind")=="diagnosis"
        if diagnosis:
            verified,report = self._diagnosis(row,job,workspace)
            if prior!=verified:
                self.fail("WHEEL_DIAGNOSIS_UNVERIFIED","El informe no coincide con el diagnóstico verificado.")
        elif self.b.git_state(workspace,check_main=True)["origin_main"]!=prior["main_sha"]:
            self.fail("PUBLICATION_UNVERIFIED","MAIN cambió antes de cerrar la tarjeta.")
        card,comments = self._snapshot(grant["card_id"])
        if card["idList"]!=QUEUE:
            self.fail("WHEEL_TRELLO_CHANGED","La tarjeta ya no ocupa el lugar autorizado.")
        action = "comment" if letter=="C" else "move"
        if self._operations(row,action):
            self.fail("WHEEL_PRIOR_OPERATION","Existe una operación previa que requiere conciliación.")
        if letter=="C":
            if [c["id"] for c in self.f.original_comments(card["id"],comments)]!=grant["comment_ids"]:
                self.fail("WHEEL_TRELLO_CHANGED","Aparecieron comentarios después de la autorización.")
            lines=self._validation(job)
            guide = "\n".join(f"{i}. {step}" for i, step in enumerate(lines, 1))
            text = (report+"\n\nComprobación en iPhone\n"+guide if diagnosis
                    else guide+"\n\nPublicación técnica correcta.")
            data={"card_id":card["id"],"text":text,"job_id":job["id"]}
        else:
            prior_comment=self._prior_stage(grant,"C")
            ops=self._operations(row,"comment")
            if len(ops)!=1 or self._trello_receipt("C",row,grant,ops[0])!=prior_comment:
                self.fail("WHEEL_COMMENT_UNVERIFIED","El comentario ya no coincide con el que se verificó.")
            data={"card_id":card["id"],"list_id":CHECK}
        record=self.b.prepare_write(action,data,inline_marker=True)
        self.f._update(row["card_id"],row["attempt"],**{("comment_operation" if letter=="C" else "move_operation"):record["operation"]})
        outcome=self.b.write(record["operation"],permit("trello-write",record))
        if outcome["state"]!="verified":
            self.fail("WHEEL_TRELLO_UNCERTAIN","No se confirmó el efecto externo. Se requiere conciliación.")
        return self._trello_receipt(letter,row,grant,self._operations(row,action)[0])

    def _prior_stage(self,grant,letter):
        with self.b.db() as db:
            stage=db.execute("SELECT receipt FROM wheel_stages WHERE grant_id=? AND letter=? AND state='verified'",
                             (grant["grant_id"],letter)).fetchone()
        if not stage:
            self.fail("WHEEL_PREREQUISITE","Falta la acreditación de la etapa anterior.")
        return json.loads(stage[0])

    def reconcile(self,letter,row,grant):
        if not row:
            return None
        job,workspace=self._job(row,grant)
        if letter=="A":
            with self.b.db() as db:
                used=db.execute("SELECT a.used FROM approvals a JOIN wheel_stages s ON s.approval_id=a.id "
                                "WHERE s.grant_id=? AND s.letter='A'",(grant["grant_id"],)).fetchone()
            if used and used["used"] is not None and job["state"] not in ("prepared","interrupted","detached","needs_review"):
                return {"job":job["id"],"state":job["state"]}
            return None
        if letter=="B":
            if grant.get("work_kind")=="diagnosis":
                return self._diagnosis(row,job,workspace)[0]
            if not self._reconcile_publication(row,grant,workspace):
                return None
            return self._published(row,workspace,sync=True)
        ops=self._operations(row,"comment" if letter=="C" else "move")
        if len(ops)!=1 or ops[0]["state"]=="prepared":
            return None
        if ops[0]["state"]!="verified" and not self.b.reconcile_write(ops[0]["id"])["verified"]:
            return None
        return self._trello_receipt(letter,row,grant,ops[0])
