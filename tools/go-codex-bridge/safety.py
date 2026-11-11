"""Local, one-operation approvals. No polling path may release side effects."""
import json
import re
import subprocess
import time
import uuid
from pathlib import Path

class Safety:
    def __init__(self, bridge, error, canonical, digest, utc):
        self.b, self.Error, self.canonical, self.digest, self.utc = bridge, error, canonical, digest, utc
        self.previews = {}

    def git(self, workspace):
        state = self.b.git_state(workspace)
        if state.get("git"):
            state = dict(state)
            state["branch"] = self.git_command(workspace,"branch","--show-current").strip()
            state["origin"] = self.git_command(workspace,"remote","get-url","origin").strip()
            state["diff_sha256"] = self.digest(self.git_command(workspace, "diff", "--binary", "HEAD"))
            status = self.git_command(workspace, "status", "--porcelain=v1", "--untracked-files=all")
            state["status_sha256"] = self.digest(status)
            # A boolean dirty flag does not bind the contents of untracked files.
            untracked = self.git_command(workspace, "ls-files", "--others", "--exclude-standard", "-z")
            hashes = {}
            root = Path(workspace).resolve()
            for name in filter(None, untracked.split("\0")):
                path = (root / name).resolve()
                if not path.is_relative_to(root) or not path.is_file() or path.is_symlink():
                    raise self.Error("WORKSPACE_AMBIGUOUS", "Archivo temporal fuera del Ã¡mbito autorizado.")
                hashes[name] = __import__("hashlib").sha256(path.read_bytes()).hexdigest()
            state["untracked"] = hashes
        return state

    def git_command(self, workspace, *args):
        result = subprocess.run(["git", "-C", str(workspace), *args], capture_output=True,
                                encoding="utf-8", errors="strict", timeout=45,
                                creationflags=0x08000000 if __import__("os").name == "nt" else 0)
        if result.returncode:
            raise self.Error("GIT_OPERATION_BLOCKED", "Git no confirmÃ³ la operaciÃ³n; no se repite automÃ¡ticamente.")
        return result.stdout

    def card(self, card_id):
        from factory import BOARD, QUEUE, CHECK
        card = self.b.api("/1/cards/" + card_id, {"fields":"id,idBoard,idList,name,desc,shortLink,closed,dateLastActivity"})
        if not isinstance(card, dict) or card.get("id") != card_id or card.get("idBoard") != BOARD or card.get("idList") not in (QUEUE, CHECK) or card.get("closed") or card.get("desc"):
            raise self.Error("CARD_CONTEXT_INVALID", "La tarjeta no pertenece al Ã¡mbito autorizado de la cola.")
        agents = set(re.findall(r"\b(?:A|AGENTE\s*)([1-5])\b", card.get("name", ""), re.I))
        if agents != {"4"}:
            wheel=self.b.factory.wheel
            policy=wheel.live_policy()
            if not policy:
                raise self.Error("AGENT_NOT_AUTHORIZED", "Solo se permiten operaciones sobre tarjetas del agente 4.", 403)
            with self.b.db() as db:
                row=db.execute("SELECT * FROM wheel_grants WHERE card_id=? ORDER BY attempt DESC LIMIT 1",
                               (card_id,)).fetchone()
            if not row:
                raise self.Error("AGENT_NOT_AUTHORIZED", "La tarjeta aún no tiene un permiso firmado para el agente 4.", 403)
            grant=wheel._verified(row)
            if (grant["agent"]!="4" or grant["origin"]!=QUEUE or grant["destination"]!=CHECK or
                    grant["title"]!=card["name"] or grant.get("live_consent_sha256")!=policy["consent_sha256"]):
                raise self.Error("AGENT_NOT_AUTHORIZED", "La tarjeta no coincide con la autorización continua.", 403)
        copied = self.b.read_card("https://trello.com/c/" + card["shortLink"])["data"]
        checks = copied.get("verification", {})
        actual = copied["card"]
        keys = ("id", "idBoard", "idList", "name", "desc", "dateLastActivity")
        if not checks.get("stable_during_read") or not checks.get("pagination_exhausted") or any(actual.get(k) != card.get(k) for k in keys):
            raise self.Error("CARD_CONTEXT_CHANGED", "La lectura de la tarjeta es incompleta o cambiÃ³ durante la revisiÃ³n.")
        return {"card": {k:actual.get(k) for k in keys},
                "comments": [{"id": c["id"], "author":c.get("creatorId"), "sha256":self.digest(c["text"])} for c in copied["comments"]]}

    def context(self, job):
        agent = job["data"]["agent"]
        if agent not in ("4", "PRUEBA"):
            raise self.Error("AGENT_NOT_AUTHORIZED", "Solo el agente 4 estÃ¡ autorizado para trabajar.", 403)
        path, _ = self.b.workspace(agent)
        data = job["data"]
        if self.digest(data["instruction"]) != data["instruction_sha256"]:
            raise self.Error("INSTRUCTION_CHANGED", "La instrucciÃ³n preparada ya no coincide con su huella.")
        source = data.get("source", {})
        context = {"source":source, "git": self.git(path), "session":self.b.approval_actor["session"]}
        if source.get("card_id"):
            context["trello"] = self.card(source["card_id"])
            if source.get("source") == "verified-queue":
                policy=self.b.factory.wheel.live_policy()
                spec = self.b.factory._spec({**context["trello"]["card"], "shortLink":self.b.api("/1/cards/"+source["card_id"], {"fields":"shortLink"})["shortLink"]},
                    live_queue=bool(policy),initial_card_ids=policy["initial_card_ids"] if policy else ())
                if spec["instruction_sha"] != data["instruction_sha256"] or spec["comment_ids"] != source["comment_ids"]:
                    raise self.Error("INSTRUCTION_CHANGED", "Los comentarios completos cambiaron desde la preparaciÃ³n.")
        return context

    def preview(self, action, payload):
        now = time.time()
        self.previews = {k:v for k,v in self.previews.items() if v["expires"] > now}
        item = {"id":uuid.uuid4().hex, "action":action, "payload":payload,
                "sha256":self.digest(self.canonical(payload)), "expires":now+600}
        self.previews[item["id"]] = item
        return item

    def confirm(self, identifier, action, payload):
        # Pop first, including failed comparisons: every attempt requires fresh review.
        item = self.previews.pop(identifier, None)
        if not item or item["expires"] <= time.time() or item["action"] != action or item["payload"] != payload:
            raise self.Error("PREVIEW_EXPIRED", "La operaciÃ³n cambiÃ³ o su revisiÃ³n caducÃ³. Revisa de nuevo el contenido exacto.", 403)

    def write_context(self, payload):
        context = {"trello":self.card(payload["card_id"]), "session":self.b.approval_actor["session"]}
        if payload.get("list_id"):
            from factory import NAMES
            if payload["list_id"] not in NAMES:
                raise self.Error("DESTINATION_NOT_AUTHORIZED", "La lista de destino no está autorizada.")
            self.b.factory._lists()
            context["target_list"] = {"id":payload["list_id"],"name":NAMES[payload["list_id"]]}
        job_id = payload.get("job_id")
        if not job_id:
            with self.b.db() as db:
                row = db.execute("SELECT job_id FROM factory_attempts WHERE card_id=? ORDER BY attempt DESC LIMIT 1", (payload["card_id"],)).fetchone()
                job_id = row[0] if row else None
        if job_id:
            job = self.b.job(job_id)
            path, sandbox = self.b.workspace(job["data"]["agent"])
            if job["data"].get("source",{}).get("card_id") not in (None,payload["card_id"]):
                raise self.Error("CARD_JOB_MISMATCH", "La instrucción corresponde a otra tarjeta.")
            if self.digest(job["data"]["instruction"]) != job["data"]["instruction_sha256"]:
                raise self.Error("INSTRUCTION_CHANGED", "La instrucción cambió desde la preparación.")
            if job["data"]["agent"] != "4" or job["data"]["agent_settings"] != self.b.config["agents"]["4"]:
                raise self.Error("AGENT_CHANGED", "La asignaciÃ³n del agente cambiÃ³.")
            context.update(job=job_id, instruction_sha256=job["data"]["instruction_sha256"], agent="4", workspace=str(path), sandbox=sandbox, git=self.git(path))
        else:
            path, sandbox = self.b.workspace("4")
            context.update(agent="4", workspace=str(path), sandbox=sandbox, git=self.git(path))
        return context

    def validate_write(self, record):
        if record["action"] not in ("comment", "move") or record.get("context") != self.write_context(record["payload"]):
            raise self.Error("OPERATION_CHANGED", "La tarjeta, instrucciÃ³n, carpeta o estado Git cambiÃ³. Prepara otra operaciÃ³n.", 403)

    def evidence(self, job):
        result = job.get("result") or {}
        if job["state"] != "completed" or result.get("exit_code") != 0 or result.get("failed_commands"):
            raise self.Error("PUBLICATION_NOT_READY", "Solo puede revisarse una ejecuciÃ³n terminada con pruebas correctas.")
        found = re.findall(r"^GO_FACTORY_EVIDENCE:\s*(\{[^\n]*\})\s*$", result.get("response", ""), re.M)
        if len(found) != 1:
            raise self.Error("PUBLICATION_TESTS_MISSING", "Falta el informe de pruebas; el resultado de Codex no acredita una publicaciÃ³n.")
        evidence = json.loads(found[0])
        folder = self.b.home / "ejecuciones" / job["id"]
        commands = []
        for log in (folder / "eventos.jsonl", *sorted(folder.glob("eventos-reanudacion-*.jsonl"))):
            if not log.exists():
                continue
            for line in log.read_text(encoding="utf-8").splitlines():
                event = json.loads(line); item = event.get("item") or {}
                if event.get("type") == "item.completed" and item.get("type") == "command_execution" and item.get("status") == "completed" and item.get("exit_code") == 0:
                    commands.append(str(item.get("command") or item.get("cmd") or ""))
        tests = evidence.get("tests")
        if not tests or any(not isinstance(t, dict) or t.get("passed") is not True or t.get("command") not in commands for t in tests) or not any(re.search(r"\btsc\b", c) for c in commands) or not any(re.search(r"\bexpo\s+export\b", c) for c in commands):
            raise self.Error("PUBLICATION_TESTS_MISSING", "TypeScript, exportaciÃ³n y pruebas deben constar como comandos terminados.")
        return evidence

    def publication_payload(self, job_id):
        job = self.b.job(job_id)
        from factory import diagnostic_instruction
        if diagnostic_instruction(job["data"]["instruction"]):
            raise self.Error("WHEEL_DIAGNOSIS_SCOPE", "El diagnóstico de solo lectura no admite una publicación.")
        evidence = self.evidence(job)
        if job["data"]["agent"] != "4":
            raise self.Error("AGENT_NOT_AUTHORIZED", "Solo puede publicar el agente 4.")
        path, _ = self.b.workspace("4")
        context = self.context(job)
        remote = self.git_command(path, "remote", "get-url", "origin").strip()
        if not re.fullmatch(r"(?:https://github\.com/|git@github\.com:)goappdev01/goapp(?:\.git)?", remote, re.I):
            raise self.Error("PUBLICATION_REMOTE_INVALID", "El destino no es goappdev01/goapp.")
        branch = self.git_command(path, "branch", "--show-current").strip()
        if branch != "main" and not branch.startswith("codex/"):
            raise self.Error("PUBLICATION_BRANCH_INVALID", "La rama no estÃ¡ preparada para esta integraciÃ³n.")
        remote_main = self.git_command(path, "ls-remote", "origin", "refs/heads/main").split()[0]
        if context["git"].get("head") != remote_main or context["git"].get("untracked"):
            raise self.Error("PUBLICATION_BASE_CHANGED", "MAIN o archivos sin seguimiento requieren integraciÃ³n y nueva revisiÃ³n.")
        if self.git_command(path, "diff", "--cached", "--name-only"):
            raise self.Error("PUBLICATION_INDEX_BUSY", "Hay contenido preparado en el Ã­ndice; no se sobrescribe.")
        diff = self.git_command(path, "diff", "--binary", "HEAD")
        files = list(filter(None, self.git_command(path, "diff", "--name-only", "-z", "HEAD").split("\0")))
        if not files or len(diff.encode("utf-8")) > 1024*1024:
            raise self.Error("PUBLICATION_EMPTY_OR_LARGE", "No hay un parche revisable completo para publicar.")
        with self.b.db() as db:
            if db.execute("SELECT 1 FROM jobs WHERE state IN ('running','detached')").fetchone():
                raise self.Error("PUBLICATION_EXECUTION_ACTIVE", "Hay una ejecuciÃ³n activa.")
        return {"action":"publish-main", "job":job_id, "agent":"4", "workspace":str(path), "context":context,
                "target":"origin/main", "remote_main":remote_main, "branch":branch, "files":files,
                "diff":diff, "tests":evidence["tests"], "message":"GO: cambio revisado del agente 4 ("+job_id[:8]+")"}

    def publish(self, payload, approval):
        try:
            return self._publish(payload,approval)
        except Exception as error:
            self.b.invalidate_approval(approval,getattr(error,"code","PUBLICATION_UNCERTAIN"))
            raise

    def _publish(self, payload, approval):
        with self.b.mutex:
            if self.publication_payload(payload["job"]) != payload:
                raise self.Error("PUBLICATION_CHANGED", "El parche o MAIN cambiÃ³; se necesita otra autorizaciÃ³n.")
            identifier = uuid.uuid4().hex
            with self.b.db() as db:
                self.b.consume(db, approval, "publish-main", payload)
                db.execute("INSERT INTO operations VALUES(?,?,?,?,?,?)", (identifier,"publish-main","sending",self.canonical(payload),None,self.utc()))
                self.b.audit("publication_released", {"operation":identifier,"job":payload["job"],"target":"origin/main","approval":approval},db)
            try:
                path = payload["workspace"]
                self.git_command(path, "commit", "--only", "-m", payload["message"], "--", *payload["files"])
                sha = self.git_command(path,"rev-parse","HEAD").strip()
                parent = self.git_command(path,"rev-parse","HEAD^").strip()
                patch = self.git_command(path,"diff","--binary","HEAD^","HEAD")
                if parent != payload["remote_main"] or patch != payload["diff"]:
                    raise self.Error("PUBLICATION_COMMIT_CHANGED", "El commit difiere del parche aprobado; no se envÃ­a.")
                self.git_command(path,"push","origin","HEAD:refs/heads/main")
                actual = self.git_command(path,"ls-remote","origin","refs/heads/main").split()[0]
                if actual != sha:
                    raise self.Error("PUBLICATION_UNVERIFIED", "El SHA remoto no coincide; no se repite el push.")
                state, result = "verified", {"main_sha":sha,"tests_verified":True,"metro":"pending-independent-verification","iphone":"pending-owner-validation"}
            except Exception as error:
                state, result = "unknown", {"code":getattr(error,"code","PUBLICATION_UNCERTAIN"),"automatic_retry":False}
            with self.b.db() as db:
                db.execute("UPDATE operations SET state=?,result=? WHERE id=?", (state,self.canonical(result),identifier))
                self.b.audit("publication_result", {"operation":identifier,"state":state},db)
            if state != "verified":
                self.b.factory._pause("PUBLICATION_UNCERTAIN")
            return {"operation":identifier,"state":state,"result":result}
