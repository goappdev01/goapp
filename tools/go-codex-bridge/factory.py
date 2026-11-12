"""Disabled-by-default, fail-closed controller for the existing local bridge.

No code in this module opens a socket, launches Codex, or mutates Trello on
import. One enabled bridge process owns one queue; uncertain states are never
automatically replayed.
"""
from __future__ import annotations

import json
from pathlib import Path
import re
import subprocess
import threading
import time
import urllib.request
import urllib.parse

BOARD = "6abc770a895998672bb4294e"
QUEUE = "6ac143de34ad352f3e74a750"
CHECK = "6ad77a46825b5e9ca571b3a3"
DONE = "6ac1759ef45faba2f247d0ff"
OWNER = "692315a454c5cfeac3e7f365"
INSTALL_CARD = "6aedd2b6bb1b6a0f782488e8"
INSTALL_CARDS = frozenset((INSTALL_CARD, "6af01d5ec274670459675173"))
NAMES = {
    QUEUE: "AGENTE 4-COLA DE  PROMPT PARA CODEX-PELUQUERÍAS",
    CHECK: "AGENTE 4-COMPROBAR RESPUESTAS CODEX- PELUQUERÍAS",
    DONE: "Prompt YA HECHOS",
}
LIMIT_RE = re.compile(r"usage limit|rate limit|credits? exhausted|cuota agotada|límite de uso", re.I)
CORRECTION_RE = re.compile(r"^\s*(?:#\s*)?(?:CORRECCI[ÓO]N|AJUSTE|INSTRUCCI[ÓO]N|AMPLIACI[ÓO]N)\b", re.I)


def diagnostic_instruction(text):
    return bool(re.search(r"\b(?:modo inspecci[oó]n|solo lectura|s[oó]lo diagn[oó]stico)\b", text, re.I)
                and re.search(r"^\s*(?:[-*]\s*)?no (?:modificar archivos|programar nada|modificar c[oó]digo)\b", text, re.I | re.M)
                and re.search(r"^\s*(?:[-*]\s*)?no (?:hacer commits|publicar|modificar main)\b", text, re.I | re.M))


GUIDE_NAVIGATION = re.compile(
    r'(?:(?:^|[.;:!?]\s+)\s*(?i:en|desde)|\b(?i:abre|entra en|ve a|accede a|vuelve a|regresa a))\s+'
    r'(?:(?i:(?:la |el )?(?:pantalla|pestaña|sección|ficha|menú|apartado)\s+(?:de )?))?'
    r'(?!(?i:iPhone|GO)\b(?:[.,;:]|\s+(?i:y|para)\b|$))'
    r'(?:[«“"][^»”"]+[»”"]|[A-ZÁÉÍÓÚÜÑ]\w*)'
)
GUIDE_ACTION = re.compile(
    r"\b(?:abre|entra|accede|ve a|pulsa|toca|elige|selecciona|desliza|desplázate|"
    r"escribe|introduce|activa|desactiva|vuelve|regresa|cierra|mantén|cambia|"
    r"confirma|cancela|guarda|busca|arrastra|marca|desmarca)\b", re.I
)
GUIDE_EXPECTATION = re.compile(
    r"\b(?:debe(?:n)?|verás|aparec(?:e|en|erá|erán)|se (?:muestra|abre|cierra|mantiene|conserva|actualiza)|"
    r"permanece|queda|sigue|comprueba que|verifica que|confirma que)\s+\S", re.I
)


def guide_has_personal_steps(lines):
    """Check for navigation, an action and an observable result across the guide."""
    if not isinstance(lines, list) or not lines or any(
        not isinstance(line, str) or not line.strip() or len(line) > 280 or
        re.search(r"[\x00-\x1f]", line) for line in lines
    ):
        return False
    return all(any(cue.search(line) for line in lines)
               for cue in (GUIDE_NAVIGATION, GUIDE_ACTION, GUIDE_EXPECTATION))


def normalize_guide(lines):
    """Split long steps without removing words or sending them to a model."""
    if not isinstance(lines,list) or not lines or len(lines)>60:
        return lines
    normalized=[]
    for line in lines:
        if not isinstance(line,str) or len(line)>4000 or re.search(r"[\x00-\x1f]",line):
            return lines
        remaining=line.strip()
        while len(remaining)>280:
            boundary=max(remaining.rfind(". ",0,280),remaining.rfind("; ",0,280))
            if boundary<80:
                boundary=remaining.rfind(" ",0,281)
                if boundary<1:
                    return lines
            else:
                boundary+=1
            normalized.append(remaining[:boundary].strip())
            remaining=remaining[boundary:].strip()
        if remaining:
            normalized.append(remaining)
    return normalized


class Factory:
    def __init__(self, bridge, error, canonical, digest, utc):
        self.bridge, self.Error = bridge, error
        self.canonical, self.digest, self.utc = canonical, digest, utc
        self.lock = threading.RLock()
        self.stopping = False
        with bridge.db() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS factory_control (
              id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0,
              pause_reason TEXT, checked TEXT, next_check REAL NOT NULL DEFAULT 0,
              backoff INTEGER NOT NULL DEFAULT 0, queue_preview TEXT NOT NULL DEFAULT '[]');
            INSERT OR IGNORE INTO factory_control(id,enabled) VALUES(1,0);
            CREATE TABLE IF NOT EXISTS factory_attempts (
              card_id TEXT NOT NULL, attempt INTEGER NOT NULL, title TEXT NOT NULL,
              instruction_sha TEXT NOT NULL, state TEXT NOT NULL, job_id TEXT,
              before_sha TEXT, comment_operation TEXT, move_operation TEXT,
              started TEXT, finished TEXT, detail TEXT,
              PRIMARY KEY(card_id,attempt));
            """)
        from wheel_queue import Wheel
        self.wheel = Wheel(self)


    def pause_on_startup(self):
        with self.bridge.db() as db:
            db.execute("UPDATE factory_control SET enabled=0,next_check=0,backoff=0 WHERE id=1")
            changed=db.execute("UPDATE wheel_control SET enabled=0,reason='RESTART_REQUIRES_ACTIVATION' WHERE enabled=1").rowcount
            if changed:
                self.bridge.audit("wheel_startup_paused",{"requires_explicit_activation":True},db)
        self.wheel.reconcile_unstarted_worktree()
        self.wheel.continuity.reconcile_published_stale()
        self.wheel.continuity.reconcile_unreleased_comment()

    def status(self):
        with self.bridge.db() as db:
            control = dict(db.execute("SELECT * FROM factory_control WHERE id=1").fetchone())
            rows = [dict(x) for x in db.execute(
                "SELECT * FROM factory_attempts ORDER BY rowid DESC LIMIT 50")]
        control["enabled"] = bool(control["enabled"])
        control["queue_preview"] = json.loads(control["queue_preview"])
        control["attempts"] = rows
        control["current"] = next((r for r in rows if r["state"] in ("running", "commenting", "moving")), None)
        control["blocked"] = [r for r in rows if r["state"] in ("blocked", "limit_pause")]
        control["automatic_execution"] = False
        control["monitoring"] = control["enabled"]
        pending = [r for r in rows if r["state"] in ("prepared", "running", "pending_review", "commenting", "moving")]
        control["current"] = pending[0] if pending else None
        jobs = []
        for row in pending:
            if row.get("job_id"):
                jobs.append(self.bridge.job(row["job_id"]))
        running = any(j["state"] in ("running", "detached") for j in jobs)
        review = any(j["state"] == "completed" for j in jobs)
        blocked = bool(control["pause_reason"] or control["blocked"] or any(j["state"] in ("blocked","failed","interrupted","needs_review") for j in jobs))
        awaiting = any(p["expires"] > time.time() for p in getattr(getattr(self.bridge,"safety",None),"previews",{}).values())
        control["states"] = {"PAUSADA": not control["enabled"], "VIGILANDO":control["enabled"],
            "PREPARADA":any(j["state"] == "prepared" for j in jobs),
            "PENDIENTE DE AUTORIZACIÓN":awaiting,
            "EJECUTANDO":running, "PENDIENTE DE REVISIÓN":review, "BLOQUEADA":blocked}
        control["state"] = ("BLOQUEADA" if blocked else "EJECUTANDO" if running else "PENDIENTE DE AUTORIZACIÓN" if awaiting else "PENDIENTE DE REVISIÓN" if review else "PREPARADA" if control["states"]["PREPARADA"] else "VIGILANDO" if control["enabled"] else "PAUSADA")
        control["lists"] = {"board": BOARD, "queue": QUEUE, "check": CHECK, "done": DONE}
        control["wheel"] = self.wheel.status()
        control["automatic_execution"] = control["wheel"]["enabled"]
        return control

    def toggle(self, enabled):
        if type(enabled) is not bool:
            raise self.Error("FACTORY_STATE_INVALID", "Selecciona activar o pausar.")
        with self.lock, self.bridge.db() as db:
            db.execute("UPDATE factory_control SET enabled=?,pause_reason=NULL,next_check=0 WHERE id=1",
                       (int(enabled),))
            self.bridge.audit("factory_toggled", {"enabled": enabled, "board": BOARD, "queue": QUEUE}, db)
        return self.status()

    def _control(self):
        with self.bridge.db() as db:
            return dict(db.execute("SELECT * FROM factory_control WHERE id=1").fetchone())

    def _pause(self, reason, *, retry=False):
        # Errors never schedule retries of executions or mutations.
        with self.bridge.db() as db:
            db.execute("UPDATE factory_control SET enabled=0,pause_reason=?,next_check=0,backoff=0 WHERE id=1", (reason,))
            self.bridge.audit("factory_paused", {"reason":reason,"automatic_retry":False}, db)

    def _lists(self):
        actual = self.bridge.api("/1/boards/" + BOARD + "/lists", {"filter": "open", "fields": "id,name"})
        if not isinstance(actual, list):
            raise self.Error("FACTORY_LISTS_INVALID", "No se pudieron comprobar las listas.")
        mapping = {x.get("id"): x.get("name") for x in actual if isinstance(x, dict)}
        if any(mapping.get(k) != v for k, v in NAMES.items()):
            raise self.Error("FACTORY_LISTS_CHANGED", "Los destinos del tablero no coinciden con los verificados.")

    def _identity(self):
        member = self.bridge.api("/1/members/me", {"fields": "id"})
        if not isinstance(member, dict) or member.get("id") != OWNER:
            raise self.Error("FACTORY_IDENTITY_INVALID", "La cuenta Trello conectada no es la propietaria verificada.")

    def _cards(self):
        cards = self.bridge.api("/1/lists/" + QUEUE + "/cards",
            {"fields": "id,idBoard,idList,name,desc,url,pos,closed,shortLink", "filter": "open", "limit": 1000})
        if not isinstance(cards, list) or len(cards) >= 1000:
            raise self.Error("FACTORY_QUEUE_INCOMPLETE", "La cola no se ha leído íntegra.")
        # Trello's `pos` increases from the top of the list to the bottom.
        # Sort explicitly so selection stays top-to-bottom even if the API
        # returns cards in a different array order.
        if any(not isinstance(card, dict) or not isinstance(card.get("pos"), (float, int))
               for card in cards):
            raise self.Error("FACTORY_ORDER_INVALID", "No se puede confirmar el orden real de la cola.")
        cards.sort(key=lambda card: card["pos"])
        previous = -1
        for card in cards:
            if (not isinstance(card, dict) or card.get("idBoard") != BOARD or card.get("idList") != QUEUE
                    or card.get("closed") or not re.fullmatch(r"[a-fA-F0-9]{24}", card.get("id", ""))):
                raise self.Error("FACTORY_CARD_INVALID", "Tarjeta o descripción fuera del alcance de la fábrica.")
            pos = card.get("pos")
            if not isinstance(pos, (float, int)) or pos <= previous:
                raise self.Error("FACTORY_ORDER_INVALID", "No se puede confirmar el orden real de la cola.")
            previous = pos
        live=bool(self.wheel.live_policy())
        preview = [{"card_id": c["id"], "title": c["name"], "position":c["pos"],
                    "eligible_agent4":live or set(re.findall(r"\b(?:A|AGENTE\s*)([1-5])\b", c["name"], re.I)) == {"4"}}
                   for c in cards if c["id"] not in INSTALL_CARDS]
        with self.bridge.db() as db:
            db.execute("UPDATE factory_control SET queue_preview=? WHERE id=1", (self.canonical(preview),))
        return cards

    def _spec(self, card, *, live_queue=False, initial_card_ids=()):
        if card["id"] in INSTALL_CARDS:
            raise self.Error("FACTORY_SELF_CARD", "La instalación de la fábrica está excluida de su propia cola.")
        title = card["name"]
        matches = set(re.findall(r"\b(?:A|AGENTE\s*)([1-5])\b", title, re.I))
        if not live_queue and len(matches) != 1:
            raise self.Error("FACTORY_AGENT_AMBIGUOUS", "El título no indica un agente único.")
        attempt_match = re.search(r"\bIntento\s+(\d+)\b", title, re.I)
        attempt = int(attempt_match[1]) if attempt_match else 1
        if attempt < 1:
            raise self.Error("FACTORY_ATTEMPT_INVALID", "Número de intento inválido.")
        short = card.get("shortLink")
        if not re.fullmatch(r"[A-Za-z0-9]{8}", str(short)):
            raise self.Error("FACTORY_CARD_INVALID", "La tarjeta carece de enlace corto válido.")
        snapshot = self.bridge.read_card("https://trello.com/c/" + short)["data"]
        check = snapshot["card"]
        if (not snapshot["verification"]["stable_during_read"] or not snapshot["verification"]["pagination_exhausted"]
                or check.get("id") != card["id"] or check.get("idBoard") != BOARD
                or check.get("idList") != QUEUE or check.get("desc") or check.get("name") != title):
            raise self.Error("FACTORY_CARD_CHANGED", "La tarjeta cambió durante la lectura.")
        try:
            placement = self._authorized_placement(card["id"])
        except self.Error as error:
            if not (live_queue and card["id"] in initial_card_ids and
                    not self._row(card["id"],1) and
                    error.code == "FACTORY_PLACEMENT_UNVERIFIED"):
                raise
            actions = self.bridge.api("/1/cards/" + card["id"] + "/actions",
                                      {"filter": "createCard", "limit": 1000})
            created = [action for action in actions if action.get("type") == "createCard" and
                       action.get("idMemberCreator") == OWNER]
            if len(created) != 1:
                raise self.Error("FACTORY_PLACEMENT_UNVERIFIED", "No se puede verificar que el propietario creó esta tarjeta.")
            placement = "initial-owner-card:" + created[0]["id"]
        comments = snapshot["comments"]
        if not comments or any(c.get("creatorId") != OWNER for c in comments):
            raise self.Error("FACTORY_AUTHOR_INVALID", "Hay comentarios de origen no verificado.")
        # Exclude only an exact result that this bridge actually persisted and verified.
        # A marker in an instruction is not proof of its origin.
        instructions = self.original_comments(card["id"], comments)
        if not instructions or not instructions[0]["text"].strip():
            raise self.Error("FACTORY_INSTRUCTION_MISSING", "Falta la instrucción original.")
        if not live_queue and attempt == 1 and len(instructions) != 1:
            raise self.Error("FACTORY_COMMENTS_AMBIGUOUS", "Hay comentarios adicionales sin un intento nuevo.")
        if not live_queue and attempt > 1 and (len(instructions) < attempt or
                            any(not CORRECTION_RE.match(c["text"]) for c in instructions[1:])):
            raise self.Error("FACTORY_CORRECTION_AMBIGUOUS", "No se puede distinguir una corrección autorizada de otros comentarios.")
        text = "\n\n".join(c["text"] for c in instructions)
        if len(text.encode("utf-8")) > 1024 * 1024:
            raise self.Error("FACTORY_INSTRUCTION_TOO_LARGE", "Instrucción demasiado larga.")
        instruction_sha=self.digest(text)
        live_return=False
        if live_queue:
            with self.bridge.db() as db:
                prior=db.execute("SELECT attempt,state,instruction_sha FROM factory_attempts WHERE card_id=? "
                                 "ORDER BY attempt DESC LIMIT 1",(card["id"],)).fetchone()
                if prior and prior["instruction_sha"]!=instruction_sha:
                    receipt=db.execute("SELECT g.terms FROM wheel_grants g JOIN wheel_stages s "
                                       "ON s.grant_id=g.grant_id AND s.letter='D' AND s.state='verified' "
                                       "WHERE g.card_id=? AND g.attempt=?",(card["id"],prior["attempt"])).fetchone()
                    former=json.loads(receipt["terms"]) if receipt else None
                    if (prior["state"] not in ("closed","blocked") or not former or
                            former["placement"]==placement):
                        raise self.Error("FACTORY_RETRY_INVALID","La corrección todavía no tiene un regreso autorizado a COLA.")
                    attempt=prior["attempt"]+1
                    live_return=True
                elif prior:
                    attempt=prior["attempt"]
        return {"card_id": card["id"], "attempt": attempt, "agent": "4" if live_queue else matches.pop(),
                "title": title, "instruction": text, "instruction_sha": instruction_sha,
                "comment_ids": [c["id"] for c in instructions],
                "placement": placement, "activity": check.get("dateLastActivity"),
                "live_return":live_return}

    def original_comments(self, card_id, comments):
        with self.bridge.db() as db:
            receipts = {payload["payload"]["text"] for record in db.execute(
                "SELECT payload FROM operations WHERE action='comment' AND state='verified'")
                if (payload := json.loads(record["payload"])).get("payload", {}).get("card_id") == card_id}
        return [comment for comment in comments if comment["text"] not in receipts]

    def _authorized_placement(self, card_id):
        actions = self.bridge.api("/1/cards/" + card_id + "/actions",
                                  {"filter": "updateCard,createCard", "limit": 1000})
        if not isinstance(actions, list) or len(actions) >= 1000:
            raise self.Error("FACTORY_PLACEMENT_UNVERIFIED", "No se puede revisar todo el historial de entrada a COLA.")
        movements = []
        previous_list = None
        for item in sorted(actions, key=lambda x: ((x.get("date") or "", x.get("id") or "")
                           if isinstance(x,dict) else ("", ""))):
            if not isinstance(item, dict):
                continue
            data = item.get("data") or {}
            destination = (data.get("listAfter") or data.get("list") or {}).get("id")
            before = (data.get("listBefore") or {}).get("id") or previous_list
            if destination == QUEUE and before != QUEUE and item.get("type") in ("updateCard", "createCard"):
                movements.append(item)
            if destination:
                previous_list = destination
        if not movements:
            raise self.Error("FACTORY_PLACEMENT_UNVERIFIED", "No consta quién incorporó la tarjeta a COLA.")
        latest = max(movements, key=lambda x: (x.get("date") or "", x.get("id") or ""))
        if latest.get("idMemberCreator") != OWNER:
            raise self.Error("FACTORY_PLACEMENT_UNAUTHORIZED", "La última entrada a COLA no fue realizada por el propietario.")
        return latest.get("id")

    def _row(self, card_id, attempt):
        with self.bridge.db() as db:
            row = db.execute("SELECT * FROM factory_attempts WHERE card_id=? AND attempt=?",
                             (card_id, attempt)).fetchone()
            return dict(row) if row else None

    def _update(self, card_id, attempt, **fields):
        with self.bridge.db() as db:
            db.execute("UPDATE factory_attempts SET " +
                       ",".join(k + "=?" for k in fields) + " WHERE card_id=? AND attempt=?",
                       (*fields.values(), card_id, attempt))
            self.bridge.audit("factory_attempt", {"card": card_id, "attempt": attempt,
                                                   "state": fields.get("state")}, db)

    def _git(self, workspace):
        base = self.bridge.git_state(workspace, check_main=True)
        if base.get("tracked_dirty"):
            raise self.Error("FACTORY_WORKSPACE_DIRTY", "La carpeta del agente contiene cambios ajenos.")
        p = subprocess.run(["git", "-C", str(workspace), "symbolic-ref", "--short", "HEAD"],
                           capture_output=True, text=True, timeout=15)
        branch = p.stdout.strip()
        if p.returncode or not (branch == "main" or branch.startswith("codex/")):
            raise self.Error("FACTORY_BRANCH_INVALID", "El agente no está en una rama main/codex limpia; no se sustituye su carpeta.")
        return base

    def _verify_metro(self, sha, before_sha, workspace, *, synchronize=False, api_check=False, port=8088, pinned=False):
        """Compare the delivered iOS source map with the published Git sources.

        Expo manifest revision labels may be stale. The map identifies the
        physical project and source text actually bundled by Metro.
        """
        if port not in (8088,8089) or (port==8089 and (synchronize or not pinned)):
            raise self.Error('FACTORY_METRO_SCOPE','La comprobación del entorno fijado no puede sincronizar 8088.')
        local=f'http://127.0.0.1:{port}'
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        try:
            with opener.open(local+"/status", timeout=8) as response:
                if response.read(128).strip() != b"packager-status:running":
                    raise self.Error("FACTORY_METRO_UNVERIFIED", "Metro 8088 no está listo.")
            request = urllib.request.Request(local,
                headers={"Accept": "application/expo+json", "Expo-Platform": "ios"})
            with opener.open(request, timeout=15) as response:
                manifest = json.loads(response.read(1024*1024))
            if manifest.get("extra", {}).get("expoClient", {}).get("sdkVersion") != "58.0.0":
                raise self.Error("FACTORY_METRO_UNVERIFIED", "El manifiesto iOS no es Expo SDK 58.")
            asset = urllib.parse.urlsplit(manifest.get("launchAsset", {}).get("url", ""))
            if (asset.scheme != "http" or asset.port != port or
                    not asset.path.endswith(".bundle") or "platform=ios" not in asset.query):
                raise self.Error("FACTORY_METRO_UNVERIFIED", "La URL del bundle iOS no es la esperada.")
            base = urllib.parse.urlunsplit(("http", f"127.0.0.1:{port}", asset.path, asset.query, ""))
            with opener.open(base, timeout=60) as response:
                bundle = response.read(96*1024*1024 + 1)
            if not bundle or len(bundle) > 96*1024*1024:
                raise self.Error("FACTORY_METRO_UNVERIFIED", "El bundle iOS no se entregó completo.")
            map_path = asset.path[:-7] + ".map"
            source_url = urllib.parse.urlunsplit(("http", f"127.0.0.1:{port}", map_path, asset.query, ""))
            with opener.open(source_url, timeout=60) as response:
                raw = response.read(96*1024*1024 + 1)
            if not raw or len(raw) > 96*1024*1024:
                raise self.Error("FACTORY_METRO_UNVERIFIED", "El mapa del bundle no se entregó completo.")
            source_map = json.loads(raw)
        except (OSError, TimeoutError, ValueError, TypeError):
            raise self.Error("FACTORY_METRO_UNVERIFIED", "No se pudo comprobar el bundle y su mapa de fuentes.") from None
        sources = {}
        maps = [source_map]
        while maps:
            item = maps.pop()
            maps.extend(section["map"] for section in item.get("sections", []) if "map" in section)
            for name, content in zip(item.get("sources") or [], item.get("sourcesContent") or []):
                if (isinstance(name, str) and isinstance(content, str) and
                        "node_modules" not in name and "\0" not in name):
                    sources[Path(name).resolve()] = content.replace("\r\n", "\n")
        roots = []
        for path in sources:
            if path.suffix.lower() not in (".tsx", ".ts", ".jsx", ".js"):
                continue
            for parent in path.parents:
                if (parent / ".git").exists() and (parent / "package.json").exists():
                    roots.append(parent)
                    break
            if roots:
                break
        if not roots:
            raise self.Error("FACTORY_METRO_UNVERIFIED", "No se identifica un repositorio GO para el código servido.")
        root = roots[0]
        if synchronize:
            if self.bridge.git_state(root).get("head") != sha:
                self._advance_served_checkout(root,before_sha,sha)
                return self._verify_metro(sha,before_sha,workspace,api_check=True)
            api_check = True
        # The Metro checkout can contain generated or unrelated local files.
        # Verify the committed source actually delivered in the bundle instead
        # of treating its working-tree cleanliness as proof of publication.
        served = self.bridge.git_state(root, check_main=not pinned)
        if served["head"] != sha or (not pinned and served["origin_main"] != sha) or (pinned and root.resolve()!=Path(workspace).resolve()):
            raise self.Error("FACTORY_METRO_OUTDATED", "Metro sirve una carpeta con otro commit.")
        changed = subprocess.run(["git", "-C", str(workspace), "diff", "--name-only",
                                  before_sha, sha, "--"], capture_output=True, text=True, timeout=25)
        if changed.returncode:
            raise self.Error("FACTORY_METRO_UNVERIFIED", "No se pudieron identificar las fuentes publicadas.")
        tracked_result = subprocess.run(["git", "-C", str(root), "ls-files", "-z", "--cached"],
                                        capture_output=True, timeout=25)
        if tracked_result.returncode:
            raise self.Error("FACTORY_METRO_UNVERIFIED", "No se pudieron identificar las fuentes del commit servido.")
        tracked = {name.decode("utf-8", "surrogateescape").replace("\\", "/")
                   for name in tracked_result.stdout.split(b"\0") if name}
        app_prefix = "artifacts/go-app-mobile/" if (root / "artifacts/go-app-mobile/package.json").is_file() else ""
        checked = 0
        for path, delivered in sources.items():
            try:
                relative = path.relative_to(root).as_posix()
            except ValueError:
                continue
            if (path.suffix.lower() not in (".tsx", ".ts", ".jsx", ".js") or
                    path.name.endswith(".d.ts") or
                    any(part.lower() in ("tests", "__tests__") for part in Path(relative).parts)):
                continue
            if relative not in tracked:
                raise self.Error("FACTORY_METRO_UNVERIFIED", "El bundle contiene una fuente local ajena al commit.")
            committed = subprocess.run(["git", "-C", str(root), "show", f"{sha}:{relative}"],
                                       capture_output=True, timeout=25)
            if committed.returncode:
                raise self.Error("FACTORY_METRO_UNVERIFIED", "No se pudo leer una fuente del commit publicado.")
            expected_text = committed.stdout.decode("utf-8-sig").replace("\r\n", "\n")
            if delivered != expected_text:
                raise self.Error("FACTORY_METRO_OUTDATED", "El JavaScript servido contiene una fuente diferente del commit publicado.")
            checked += 1
        for relative in changed.stdout.splitlines():
            path = Path(relative)
            if (app_prefix and not relative.replace("\\", "/").startswith(app_prefix)) or path.suffix.lower() not in (".tsx", ".ts", ".jsx", ".js") or any(
                    part.lower() in ("tests", "__tests__") for part in path.parts):
                continue
            expected = (root / path).resolve()
            if expected not in sources:
                raise self.Error("FACTORY_METRO_UNVERIFIED", "Una fuente cambiada no figura en el bundle iOS.")
        if checked == 0:
            raise self.Error("FACTORY_METRO_UNVERIFIED", "No hay cambios de aplicación comparables en el bundle.")
        proof = {"served_root": str(root), "checked_sources": checked, "bundle_bytes": len(bundle), "sha":sha}
        if api_check:
            import ipaddress
            if ipaddress.ip_address(asset.hostname) not in ipaddress.ip_network("100.64.0.0/10"):
                raise self.Error("FACTORY_TAILSCALE_UNVERIFIED","El manifiesto no anuncia una dirección de Tailscale.")
            base = f"http://{asset.hostname}:{port}"
            railway = "https://goapp-api-production.up.railway.app"
            if (railway+"/api").encode() in bundle:
                api = railway+"/api/supabase/booking-conversations"
            elif (base+"/api").encode() in bundle:
                api = base+"/api/supabase/support/capabilities"
            else:
                raise self.Error("FACTORY_API_UNVERIFIED","No se encontró la API configurada en el JavaScript.")
            with opener.open(base+"/status", timeout=10) as reply:
                if reply.read(128).strip() != b"packager-status:running":
                    raise self.Error("FACTORY_TAILSCALE_UNVERIFIED","Metro no respondió por Tailscale.")
            try:
                with opener.open(api,timeout=15) as reply:
                    raise self.Error("FACTORY_API_UNVERIFIED","Se esperaba una operación protegida de la API.")
            except urllib.error.HTTPError as exc:
                expected = b"Authentication required" if api.startswith(railway) else b"AUTH_REQUIRED"
                if exc.code!=401 or expected not in exc.read(2048):
                    raise self.Error("FACTORY_API_UNVERIFIED","No se pudo verificar la API protegida.") from None
            proof["api"]="Railway directo · 401 autenticación requerida" if api.startswith(railway) else "401 AUTH_REQUIRED"
        return proof

    def _advance_served_checkout(self,root,before,sha):
        # Only the actual Expo listener's checkout may advance, never a different agent's.
        command = ("Get-NetTCPConnection -State Listen -LocalPort 8088 | "
                   "ForEach-Object {(Get-CimInstance Win32_Process -Filter ('ProcessId='+$_.OwningProcess)).CommandLine}")
        process = subprocess.run(["powershell.exe","-NoProfile","-NonInteractive","-Command",command],
                                 capture_output=True,text=True,timeout=20)
        def is_served_checkout(line):
            match = re.search(r'(?i)"([^"]+[\\/]expo[\\/]bin[\\/]cli(?:\.js)?)"\s+start\s+',line)
            if not match or not re.search(r"\s--port\s+8088\b",line):
                return False
            try:
                entry = Path(match[1]).resolve(strict=True)
            except OSError:
                return False
            return entry.is_file() and entry.is_relative_to(root.resolve()) and "node_modules" in entry.relative_to(root.resolve()).parts
        if process.returncode or not any(is_served_checkout(line) for line in process.stdout.splitlines()):
            raise self.Error("FACTORY_METRO_UNVERIFIED","El proceso Metro no identifica esta copia física.")
        git = lambda *args:self.bridge.safety.git_command(root,*args)
        served_head=git("rev-parse","HEAD").strip()
        if (git("remote","get-url","origin").strip() not in
            ("https://github.com/goappdev01/goapp.git","https://github.com/goappdev01/goapp","git@github.com:goappdev01/goapp.git")
            or git("ls-remote","origin","refs/heads/main").split()[0]!=sha):
            raise self.Error("FACTORY_METRO_OUTDATED","El destino del servidor o MAIN remoto cambió.")
        # Metro can legitimately lag several published bridge commits. Advance
        # only a clean, ancestral checkout; never replace a pinned 8089 version.
        if subprocess.run(["git","-C",str(root),"merge-base","--is-ancestor",served_head,sha],
                          capture_output=True,timeout=20).returncode:
            raise self.Error("FACTORY_METRO_OUTDATED","La copia servida no es antecesora de MAIN.")
        allowed={" M artifacts/go-app-mobile/expo-env.d.ts","?? runtime/"}
        if set(git("status","--porcelain").splitlines())-allowed:
            raise self.Error("FACTORY_METRO_DIRTY","La copia de Metro tiene cambios concurrentes que requieren revisión.")
        git("fetch","--no-tags","origin","refs/heads/main")
        if git("rev-parse","FETCH_HEAD").strip()!=sha:
            raise self.Error("FACTORY_METRO_OUTDATED","MAIN cambió durante la comprobación.")
        git("merge-base","--is-ancestor",before,sha)
        git("-c","core.hooksPath=NUL","merge","--ff-only",sha)

    def _start(self, spec):
        if spec["agent"] != "4":
            raise self.Error("AGENT_NOT_AUTHORIZED", "Solo se prepara trabajo del agente 4.", 403)
        workspace, sandbox = self.bridge.workspace(spec["agent"])
        if sandbox != "workspace-write":
            raise self.Error("FACTORY_SANDBOX_INVALID", "El agente no tiene escritura autorizada.")
        before = self._git(workspace)
        card_id, attempt = spec["card_id"], spec["attempt"]
        with self.bridge.db() as db:
            previous = db.execute("SELECT attempt,state,instruction_sha FROM factory_attempts WHERE card_id=? ORDER BY attempt DESC LIMIT 1",
                                  (card_id,)).fetchone()
            if previous:
                if attempt != previous["attempt"] + 1 or (previous["state"] != "await_review" and
                        not (spec.get("live_return") and previous["state"] in ("closed","blocked") and
                             previous["instruction_sha"]!=spec["instruction_sha"])):
                    raise self.Error("FACTORY_RETRY_INVALID", "El nuevo intento no sigue a una revisión humana.")
            elif attempt != 1:
                raise self.Error("FACTORY_RETRY_UNTRACKED", "Un intento anterior no consta en el registro local.")
            for existing in db.execute("SELECT state,data FROM jobs"):
                source = json.loads(existing["data"]).get("source", {})
                if source.get("card_id") == card_id and source.get("source") != "verified-queue":
                    raise self.Error("FACTORY_PREVIOUS_JOB", "La tarjeta ya tiene un trabajo manual; revisa su estado antes de ejecutar.")
            db.execute("INSERT INTO factory_attempts(card_id,attempt,title,instruction_sha,state,before_sha,detail) VALUES(?,?,?,?,?,?,?)",
                       (card_id, attempt, spec["title"], spec["instruction_sha"], "prepared",
                        before["origin_main"], self.canonical({"agent": spec["agent"],
                         "comments": spec["comment_ids"], "activity": spec.get("activity")})))
            self.bridge.audit("factory_prepared", {"card": card_id, "attempt": attempt,
                                                   "sha256": spec["instruction_sha"]}, db)
        job = self.bridge.prepare_text(spec["instruction"], spec["agent"], {"source": "verified-queue",
            "card_id": card_id, "attempt": attempt, "board_id": BOARD, "list_id": QUEUE,
            "comment_ids": spec["comment_ids"]})
        self._update(card_id, attempt, job_id=job["id"])
        return {"prepared": job["id"], "card": card_id, "attempt": attempt, "authorization": "required", "automatic_execution":False}

    def _resume_limit(self, spec, previous):
        raise self.Error("FACTORY_RETRY_REQUIRES_OWNER", "Revisa el resultado y prepara un nuevo intento local; cada reintento necesita otra autorización.", 403)

    def _evidence(self, row, job):
        result = job.get("result") or {}
        if job["state"] != "completed" or result.get("failed_commands") or result.get("exit_code") != 0:
            raise self.Error("FACTORY_JOB_FAILED", "Codex no terminó con éxito verificable.")
        response = result.get("response", "")
        found = re.findall(r"^GO_FACTORY_EVIDENCE:\s*(\{[^\n]*\})\s*$", response, re.M)
        if len(found) != 1:
            raise self.Error("FACTORY_EVIDENCE_MISSING", "Falta el informe técnico estructurado.")
        try:
            evidence = json.loads(found[0])
        except ValueError:
            raise self.Error("FACTORY_EVIDENCE_INVALID", "Informe técnico inválido.") from None
        tests = evidence.get("tests")
        if (not isinstance(tests, list) or not tests or not all(
                isinstance(t, dict) and t.get("passed") is True and t.get("command") for t in tests)):
            raise self.Error("FACTORY_TESTS_UNVERIFIED", "No se acreditan pruebas satisfactorias.")
        folder = self.bridge.home / "ejecuciones" / job["id"]
        logs = [path for path in [folder / "eventos.jsonl", *sorted(folder.glob("eventos-reanudacion-*.jsonl"))] if path.is_file()]
        if not logs:
            raise self.Error("FACTORY_TESTS_UNVERIFIED", "No existe registro de los comandos ejecutados.")
        commands = []
        for log in logs:
            with log.open(encoding="utf-8") as stream:
                for line in stream:
                    try:
                        event = json.loads(line)
                    except ValueError:
                        raise self.Error("FACTORY_EVENTS_INVALID", "Registro de ejecución incompleto.") from None
                    item = event.get("item") or {}
                    if event.get("type") == "item.completed" and item.get("type") == "command_execution":
                        if item.get("status") == "completed" and item.get("exit_code") == 0:
                            commands.append(str(item.get("command") or item.get("cmd") or "").strip())
        if not all(t["command"] in commands for t in tests):
            raise self.Error("FACTORY_TESTS_UNVERIFIED", "Las pruebas declaradas no constan como comandos terminados.")
        if not any(re.search(r"\btsc\b", command) for command in commands):
            raise self.Error("FACTORY_TESTS_UNVERIFIED", "Falta una comprobación TypeScript terminada.")
        if not any(re.search(r"\bexpo\s+export\b", command) for command in commands):
            raise self.Error("FACTORY_TESTS_UNVERIFIED", "Falta la exportación iOS terminada.")
        with self.bridge.db() as db:
            publications = [json.loads(r["result"]) for r in db.execute("SELECT payload,result FROM operations WHERE action='publish-main' AND state='verified'") if json.loads(r["payload"]).get("job") == job["id"]]
        if len(publications) != 1:
            raise self.Error("FACTORY_PUBLICATION_UNVERIFIED", "Falta la publicación autorizada y verificada del parche concreto.")
        sha = publications[0].get("main_sha")
        evidence["main_sha"] = sha
        if not isinstance(sha, str) or not re.fullmatch(r"[a-f0-9]{40}", sha) or sha == row["before_sha"]:
            raise self.Error("FACTORY_PUBLICATION_UNVERIFIED", "No se acredita un nuevo commit publicado.")
        workspace = self.bridge.workspace(job["data"]["agent"])[0]
        after = self._git(workspace)
        if after["origin_main"] != sha or after["head"] != sha:
            raise self.Error("FACTORY_PUBLICATION_UNVERIFIED", "MAIN remoto y la carpeta no coinciden con el informe.")
        evidence["metro"] = "verified-served-main"
        metro_proof = self._verify_metro(sha, row["before_sha"], workspace)
        validation = evidence.get("validation")
        if not guide_has_personal_steps(validation):
            raise self.Error("FACTORY_VALIDATION_INVALID", "La guía de iPhone debe indicar dónde entrar, qué hacer y qué resultado esperar.")
        if any(re.search(r"\b(?:commit|sha|deploy|despliegue|metro|validado f[ií]sicamente)\b|[a-f0-9]{40}",
                         line, re.I) for line in validation):
            raise self.Error("FACTORY_VALIDATION_INVALID", "La guía física contiene detalles técnicos o una validación no realizada.")
        return {**evidence, "metro_proof": metro_proof}

    def _op(self, row, action, payload, field):
        if (payload.get("card_id") != row["card_id"] or action not in ("comment", "move")
                or (action == "move" and payload.get("list_id") != CHECK)
                or (action == "comment" and field != "comment_operation")
                or (action == "move" and field != "move_operation")):
            raise self.Error("FACTORY_WRITE_SCOPE_INVALID", "La fábrica solo comenta y mueve su propia tarjeta a COMPROBAR.")
        operation_id = row[field]
        if operation_id:
            with self.bridge.db() as db:
                record = db.execute("SELECT state FROM operations WHERE id=?", (operation_id,)).fetchone()
            if not record:
                raise self.Error("FACTORY_OPERATION_LOST", "Falta una operación Trello; no se repite.")
            if record["state"] not in ("prepared", "verified"):
                raise self.Error("FACTORY_WRITE_UNCERTAIN", "La operación requiere revisión; no se repite automáticamente.")
            return operation_id
        prepared = self.bridge.prepare_write(action, payload)
        operation_id = prepared["operation"]
        self._update(row["card_id"], row["attempt"], **{field: operation_id})
        return operation_id

    def _complete(self, row):
        job = self.bridge.job(row["job_id"])
        if job["state"] in ("running", "detached"):
            return {"running": job["id"]}
        if job["state"] == "prepared":
            return {"prepared":job["id"],"authorization":"required"}
        if job["state"] != "completed":
            result = job.get("result") or {}
            reason = "CREDIT_LIMIT" if LIMIT_RE.search(str(result)) else "FACTORY_JOB_REQUIRES_REVIEW"
            self._update(row["card_id"],row["attempt"],state="blocked",finished=self.utc(),detail=self.canonical({"reason":reason,"agent":"4"}))
            self._pause(reason)
            return {"blocked":reason,"automatic_retry":False}
        self._update(row["card_id"],row["attempt"],state="pending_review",finished=self.utc())
        return {"pending_review":job["id"],"published":False,"iphone_validated":False}

    def prepare_followup(self, job_id, action):
        # Only prepares an exact mutation, after independently checking publication/Metro.
        if action not in ("comment", "move"):
            raise self.Error("FACTORY_WRITE_SCOPE_INVALID", "Elige comentario o traslado a COMPROBAR.")
        with self.bridge.db() as db:
            found = db.execute("SELECT * FROM factory_attempts WHERE job_id=?", (job_id,)).fetchone()
        if not found:
            raise self.Error("FACTORY_ATTEMPT_UNKNOWN", "No hay un intento de cola asociado.")
        row = dict(found); job = self.bridge.job(job_id)
        evidence = self._evidence(row,job)
        if action == "move":
            with self.bridge.db() as db:
                comment = db.execute("SELECT state FROM operations WHERE id=?", (row["comment_operation"],)).fetchone()
            if not comment or comment["state"] != "verified":
                raise self.Error("FACTORY_COMMENT_REQUIRED", "El comentario exacto debe autorizarse y verificarse antes del traslado.")
            payload = {"card_id":row["card_id"],"list_id":CHECK}
            field = "move_operation"
        else:
            payload = {"card_id":row["card_id"], "text":"\n".join(str(i+1)+". "+line for i,line in enumerate(evidence["validation"])), "job_id":job_id}
            field = "comment_operation"
        operation = self._op(row,action,payload,field)
        with self.bridge.db() as db:
            record = db.execute("SELECT payload FROM operations WHERE id=?", (operation,)).fetchone()
        return json.loads(record["payload"])

    def tick(self, manual=False):
        with self.lock:
            if self.stopping:
                return {"stopping":True}
            if not manual and self.wheel.enabled():
                return self.wheel.tick()
            control = self._control()
            if not manual and not control["enabled"]:
                return {"enabled":False}
            try:
                # This path performs GETs and local preparation only. No approve/launch/write.
                self._identity(); self._lists(); cards = self._cards()
                with self.bridge.db() as db:
                    db.execute("UPDATE factory_control SET checked=? WHERE id=1", (self.utc(),))
                if manual:
                    return {"read_only":True,"cards":len(cards),"automatic_execution":False,"enabled":bool(control["enabled"])}
                with self.bridge.db() as db:
                    active = db.execute("SELECT * FROM factory_attempts WHERE state IN ('prepared','running','commenting','moving','pending_review') ORDER BY rowid LIMIT 1").fetchone()
                if active:
                    return self._complete(dict(active))
                for card in cards:
                    if card["id"] in INSTALL_CARDS:
                        continue
                    agents = set(re.findall(r"\b(?:A|AGENTE\s*)([1-5])\b",card.get("name", ""),re.I))
                    if agents != {"4"}:
                        raise self.Error("FACTORY_HEAD_AGENT_INVALID", "La primera tarjeta no corresponde al Agente 4; la cola se detiene.")
                    spec = self._spec(card)
                    previous = self._row(card["id"],spec["attempt"])
                    if previous:
                        if previous["instruction_sha"] != spec["instruction_sha"] or previous["title"] != spec["title"]:
                            raise self.Error("FACTORY_CONTENT_CHANGED", "El contenido preparado cambió; no se reutiliza autorización.")
                        if previous["state"] in ("blocked","limit_pause","await_review"):
                            raise self.Error("FACTORY_ATTEMPT_BLOCKED", "Este intento requiere revisión local; no se reintenta.")
                        return {"prepared":previous["job_id"],"authorization":"required"}
                    return self._start(spec)
                return {"empty_agent4":True,"automatic_execution":False}
            except self.Error as error:
                self._pause(error.code)
                return {"paused":error.code,"retry":False}

    def loop(self, stop):
        delay = 1
        while not stop.wait(delay):
            delay = 60
            try:
                self.wheel.resume_after_quota()
                if self._control()["enabled"] or self.wheel.enabled():
                    result = self.tick()
                    if result.get("again"):
                        delay = 0.1
                    elif result.get("running"):
                        delay = 2
                    elif result.get("trello_retry"):
                        delay = max(0.1,min(30,result["retry_after"]-time.time()))
            except Exception:
                self.wheel.pause("FACTORY_UNEXPECTED_ERROR")
                self._pause("FACTORY_UNEXPECTED_ERROR")
