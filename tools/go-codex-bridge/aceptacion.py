"""Bounded C/D acceptance test, released only by the owner's signed local grant.

Never reads arbitrary instructions for execution: this grant permits only the
synthetic test, one named test card, and its instruction/result comments.
"""
import contextlib
import json
from pathlib import Path
import sys

from puente import Bridge, BridgeError, TEST_INSTRUCTION, canonical, digest, save_json, utc

TITLE = "GO PUENTE CODEX — PRUEBA DE CIRCUITO — 2026-10-29"
BOARD = "6abc770a895998672bb4294e"
LIST = "6ac143de34ad352f3e74a750"
GRANT = "estado/autorizacion-pruebas-CD.json"
STATE = "estado/pruebas-CD.json"


def register_owner_grant(bridge):
    record = {"version": 1, "source": "explicit-owner-reply-in-this-chat",
              "question_id": "call_1e5af5cd7add47ea947a1b1f5800cad0",
              "reply": "Sí, autorizar esa tarjeta y las pruebas C/D",
              "title": TITLE, "board_id": BOARD, "list_id": LIST,
              "maximum_cards": 1, "permitted_comments": ["synthetic-test-instruction", "actual-test-result"],
              "instruction_sha256": digest(TEST_INSTRUCTION), "workspace": str(bridge.home / "sandbox"),
              "go_production_tasks": False, "move_archive_delete": False, "actor": bridge.actor, "recorded_at": utc()}
    path = bridge.home / GRANT
    if path.exists():
        return validate_grant(bridge)
    save_json(path, {"grant": record, "mac": bridge.sign(record)})
    bridge.audit("specific_test_CD_authorized", {"source": record["source"], "question_id": record["question_id"],
        "title": TITLE, "board_id": BOARD, "list_id": LIST, "maximum_cards": 1, "instruction_sha256": record["instruction_sha256"]})
    return record


def validate_grant(bridge):
    import hmac
    path = bridge.home / GRANT
    if not path.exists():
        raise BridgeError("TEST_GRANT_REQUIRED", "Falta la autorización específica del propietario para las pruebas C/D.", 403)
    document = json.loads(path.read_text(encoding="utf-8")); grant = document["grant"]
    if not hmac.compare_digest(document["mac"], bridge.sign(grant)) or grant["title"] != TITLE or grant["board_id"] != BOARD or grant["list_id"] != LIST or grant["maximum_cards"] != 1 or grant["instruction_sha256"] != digest(TEST_INSTRUCTION):
        raise BridgeError("TEST_GRANT_INVALID", "La autorización de pruebas no coincide; no se modificará Trello.", 403)
    return grant


@contextlib.contextmanager
def test_lock(home):
    import msvcrt
    path = home / "estado/pruebas-CD.lock"
    with path.open("a+b") as stream:
        stream.seek(0)
        if stream.read(1) == b"":
            stream.write(b"L");stream.flush()
        stream.seek(0)
        try:
            msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            raise BridgeError("TEST_ALREADY_RUNNING", "La prueba C/D ya se está coordinando; no se duplica.") from None
        try:
            yield
        finally:
            stream.seek(0);msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)


def operation_row(bridge, identifier):
    with bridge.db() as db:
        row = db.execute("SELECT * FROM operations WHERE id=?", (identifier,)).fetchone()
    if not row:
        raise BridgeError("TEST_STATE_INVALID", "No se encuentra una operación anterior; revisa la evidencia antes de repetirla.")
    return dict(row)


def ensure_write(bridge, state, key, action, payload):
    if key not in state:
        record = bridge.prepare_write(action, payload)
        state[key] = record["operation"]
        save_json(bridge.home / STATE, state)  # Persist intention before any external write.
    row = operation_row(bridge, state[key])
    record = json.loads(row["payload"])
    if row["state"] == "prepared":
        approval = bridge.approve("trello-write", record, "explicit-user-operation")
        bridge.write(record["operation"], approval)
    elif row["state"] in ("sending", "unknown", "needs_review"):
        bridge.reconcile_write(record["operation"])  # Read-only; never replay a mutation.
    row = operation_row(bridge, state[key])
    if row["state"] != "verified":
        raise BridgeError("TEST_WRITE_UNCERTAIN", "La escritura de prueba necesita revisión. No se crea otra tarjeta ni se reenvía el comentario.")
    result = json.loads(row["result"])
    return result.get("response", result)


def run(bridge):
    raise BridgeError("LEGACY_AUTOMATION_DISABLED", "La autorización histórica de pruebas no permite nuevas ejecuciones ni escrituras. Utiliza permisos individuales en el panel.", 403)

    grant = validate_grant(bridge)
    bridge.token()  # If OAuth is pending, exit before preparing any Trello mutation.
    with test_lock(bridge.home):
        state_path = bridge.home / STATE
        state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {"status": "authorized-not-started", "title": TITLE, "started": utc()}
        if state.get("status") == "completed":
            return state
        lists = bridge.api("/1/boards/" + BOARD + "/lists", {"filter": "open", "fields": "id,name"})
        if not any(row["id"] == LIST for row in lists):
            raise BridgeError("TEST_LIST_CHANGED", "La lista autorizada ya no está disponible; no se elige otra automáticamente.")
        created = ensure_write(bridge, state, "create_operation", "create", {"list_id": LIST, "name": TITLE,
            "description": "Tarjeta exclusiva de pruebas del coordinador local GO Puente Codex. No ejecutar tareas de GO. Lectura, una instrucción inocua en carpeta aislada y devolución del resultado, autorizadas por el propietario el 29/10/2026."})
        card_id = created["id"]
        state["card_id"] = card_id
        card = bridge.api("/1/cards/" + card_id, {"fields": "id,name,url,idBoard,idList"})
        if card["idBoard"] != BOARD or card["idList"] != LIST or card["name"] != TITLE:
            raise BridgeError("TEST_TARGET_CHANGED", "La tarjeta de pruebas no coincide con el destino autorizado.")
        state["card_url"] = card["url"]
        instruction = ensure_write(bridge, state, "instruction_operation", "comment", {"card_id": card_id,
            "text": "INSTRUCCIÓN INOCUA AUTORIZADA — AGENTE PRUEBA\n\n" + TEST_INSTRUCTION})
        state["test_C"] = "verified-create-and-comment"
        save_json(state_path, state)
        if "job_id" not in state:
            copied = bridge.read_card(card["url"])
            matches = [c for c in copied["data"]["comments"] if c["id"] == instruction["id"]]
            if len(matches) != 1:
                raise BridgeError("TEST_COMMENT_MISSING", "No se encuentra el comentario completo que se acaba de verificar.")
            job = bridge.prepare(copied["snapshot"], matches[0]["id"], "PRUEBA")
            state["job_id"] = job["id"]
            save_json(state_path, state)
        job = bridge.job(state["job_id"])
        if job["state"] == "prepared":
            payload = bridge.execution_payload(job["id"])
            if payload["workspace"] != grant["workspace"] or payload["agent"] != "PRUEBA" or payload["sandbox"] != "read-only":
                raise BridgeError("TEST_WORKSPACE_CHANGED", "La prueba no apunta a la carpeta aislada autorizada.")
            approval = bridge.approve("execute", payload, "explicit-user-operation")
            bridge.launch(payload, approval, background=False)
            job = bridge.job(job["id"])
        if job["state"] != "completed" or not job["result"].get("test_B_exact_response"):
            state["status"] = "needs-review-no-automatic-rerun"
            state["job_state"] = job["state"]
            save_json(state_path, state)
            raise BridgeError("TEST_EXECUTION_NOT_VERIFIED", "La prueba de Codex no ha terminado con la respuesta exacta; se conserva y no se repite automáticamente.")
        outcome = "GO Puente Codex — prueba C/D verificada\n\nRespuesta real de Codex: GO_PUENTE_CODEX_OK\nCódigo de salida: " + str(job["result"]["exit_code"]) + "\nEjecución: " + job["id"] + "\n\nLa instrucción se leyó de esta tarjeta, se ejecutó con acceso de solo lectura en la carpeta aislada del puente y el resultado se ha recuperado. Esta prueba no ha modificado el código de GO."
        ensure_write(bridge, state, "result_operation", "comment", {"card_id": card_id, "text": outcome, "job_id": job["id"]})
        state.update(status="completed", test_D="verified-read-execute-return", finished=utc(), automatic_production_tasks=False)
        save_json(state_path, state)
        bridge.audit("acceptance_CD_completed", {"card_id": card_id, "job": job["id"], "production_tasks": False})
        return state


if __name__ == "__main__":
    bridge = Bridge(Path(__file__).resolve().parent)
    try:
        print(json.dumps(run(bridge), ensure_ascii=False, indent=2))
    except BridgeError as error:
        print(json.dumps({"status": "pending", "code": error.code, "message": str(error)}, ensure_ascii=False))
        sys.exit(2)
