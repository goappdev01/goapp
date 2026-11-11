"""Isolated V2 navigation. The owner's layout never grants an operation."""
import json
import re
import sqlite3
import subprocess
import time
from pathlib import Path
import urllib.error
import urllib.request

REGISTRY = {
    "factory": ("Fábrica", "Estado, trabajo y controles autorizados"),
    "expo": ("Expo Go / Metro", "8088 principal y 8089 comprobaciones"),
    "agents": ("Agentes / Codex", "Cuenta, cuota y trabajo actual"),
    "trello": ("Trello", "Tarjetas y fases del lote autorizado"),
    "system": ("Sistema", "GitHub, Railway, Supabase y Tailscale"),
    "reviews": ("Comprobar", "Resultados y comprobaciones"),
    "guide": ("Guía GO", "Ayuda contextual del centro de mando"),
    "diagnostics": ("Diagnósticos", "Informes de conexión existentes"),
    "permissions": ("Permisos", "Autorizaciones vigentes por operación"),
    "history": ("Historial", "Etapas y resultados conservados"),
}
DEFAULT = [list(REGISTRY)[:7]]
MAX_ORBITS = 12


def validate(layout):
    if (not isinstance(layout, list) or not 1 <= len(layout) <= MAX_ORBITS or
            any(not isinstance(orbit, list) or len(orbit) > 7 for orbit in layout)):
        raise ValueError("Distribución orbital inválida")
    ids = [item for orbit in layout for item in orbit]
    if (len(ids) != len(set(ids)) or any(item not in REGISTRY for item in ids) or
            not ids):
        raise ValueError("Acceso duplicado o desconocido")
    return layout


def relocate(layout, module, orbit, position):
    """Insert, shift right and cascade overflow; no swap or destructive overwrite."""
    layout = [list(items) for items in validate(layout)]
    if module not in REGISTRY or type(orbit) is not int or type(position) is not int:
        raise ValueError("Destino inválido")
    if orbit < 0 or orbit >= MAX_ORBITS or position < 0 or position > 6:
        raise ValueError("Destino fuera de las órbitas")
    for items in layout:
        if module in items:
            items.remove(module)
            break
    while len(layout) <= orbit:
        layout.append([])
    layout[orbit].insert(min(position, len(layout[orbit])), module)
    for index in range(orbit, len(layout)):
        if len(layout[index]) <= 7:
            continue
        overflow = layout[index].pop()
        if index + 1 == MAX_ORBITS:
            raise ValueError("No quedan órbitas disponibles")
        if index + 1 == len(layout):
            layout.append([])
        layout[index + 1].insert(0, overflow)
    while len(layout) > 1 and not layout[-1]:
        layout.pop()
    return validate(layout)


def guide(question, layout, status):
    """Local, deterministic guidance: no private card text goes to a model."""
    query = re.sub(r"\s+", " ", str(question).casefold()).strip()
    if not query or len(query) > 300:
        raise ValueError("Escribe una pregunta breve")
    if any(word in query for word in ("activar", "pausar", "detener", "publicar", "mover tarjeta")):
        action = "Los cambios requieren la revisión y confirmación del panel de Fábrica."
    else:
        action = "Puedes abrir ese panel para consultar su estado."
    matches = [(i + 1, j + 1, key) for i, items in enumerate(layout) for j, key in enumerate(items)
               if key in query or any(part in query for part in REGISTRY[key][0].casefold().split() if len(part) > 3)]
    if not matches:
        key = "expo" if any(s in query for s in ("8088", "8089", "metro")) else "factory"
        matches = [(i + 1, j + 1, key) for i, items in enumerate(layout) for j, item in enumerate(items) if item == key]
    if not matches:
        return "Ese acceso no está en tus órbitas. Usa «Añadir acceso» para colocarlo; no cambia permisos."
    orbit, position, key = matches[0]
    detail = ""
    if key == "factory":
        detail = " Estado actual: " + status.get("factory", "sin verificar") + "."
    if key == "expo":
        detail = " Comprueba 8088 y 8089 por separado; la apertura real en iPhone sigue requiriendo tu comprobación."
    return f"Órbita {orbit}, posición {position}: pulsa «{REGISTRY[key][0]}». {action}{detail}"


class OrbitV2:
    def __init__(self, bridge):
        self.bridge = bridge
        with bridge.db() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS orbit_v2_layout (
                principal TEXT PRIMARY KEY, revision INTEGER NOT NULL, layout TEXT NOT NULL,
                labels TEXT NOT NULL DEFAULT '{}',
                updated REAL NOT NULL)""")

    def state(self, principal):
        with self.bridge.db() as db:
            row = db.execute("SELECT revision,layout,labels,updated FROM orbit_v2_layout WHERE principal=?", (principal,)).fetchone()
        if not row:
            return {"revision": 0, "layout": [list(items) for items in DEFAULT], "labels": {}, "updated": None}
        return {"revision": row["revision"], "layout": validate(json.loads(row["layout"])),
                "labels": json.loads(row["labels"]), "updated": row["updated"]}

    def move(self, principal, revision, module, orbit, position):
        if type(revision) is not int or not isinstance(principal, str) or len(principal) < 16:
            raise ValueError("Sesión o revisión inválida")
        with self.bridge.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT revision,layout,labels FROM orbit_v2_layout WHERE principal=?", (principal,)).fetchone()
            actual = row["revision"] if row else 0
            if revision != actual:
                raise ValueError("La distribución cambió en otro dispositivo. Actualiza antes de mover.")
            before = json.loads(row["layout"]) if row else [list(items) for items in DEFAULT]
            after = relocate(before, module, orbit, position)
            now = time.time()
            db.execute("""INSERT INTO orbit_v2_layout(principal,revision,layout,labels,updated) VALUES(?,?,?,?,?)
                ON CONFLICT(principal) DO UPDATE SET revision=excluded.revision,
                layout=excluded.layout,updated=excluded.updated""",
                (principal, actual + 1, json.dumps(after, ensure_ascii=False), row["labels"] if row else "{}", now))
            self.bridge.audit("orbit_v2_layout_changed", {"principal_hash": principal, "revision": actual + 1,
                                                          "module": module, "orbit": orbit, "position": position}, db)
        return {"revision": actual + 1, "layout": after,
                "labels": json.loads(row["labels"]) if row else {}, "updated": now}

    def configure(self, principal, revision, module, *, label=None, remove=False):
        if (type(revision) is not int or not isinstance(principal,str) or len(principal)<16 or
                module not in REGISTRY or type(remove) is not bool):
            raise ValueError("Configuración inválida")
        if label is not None and (not isinstance(label, str) or not 1 <= len(label.strip()) <= 28 or
                                  re.search(r"[\x00-\x1f<>]", label)):
            raise ValueError("Nombre visible inválido")
        with self.bridge.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT revision,layout,labels FROM orbit_v2_layout WHERE principal=?", (principal,)).fetchone()
            actual = row["revision"] if row else 0
            if actual != revision:
                raise ValueError("La distribución cambió en otro dispositivo")
            layout = json.loads(row["layout"]) if row else [list(items) for items in DEFAULT]
            labels = json.loads(row["labels"]) if row else {}
            if remove:
                for orbit in layout:
                    if module in orbit:
                        orbit.remove(module)
                        break
                while len(layout)>1 and not layout[-1]:
                    layout.pop()
                validate(layout)
            if label is not None:
                labels[module] = label.strip()
            now = time.time()
            db.execute("""INSERT INTO orbit_v2_layout(principal,revision,layout,labels,updated) VALUES(?,?,?,?,?)
                ON CONFLICT(principal) DO UPDATE SET revision=excluded.revision,layout=excluded.layout,
                labels=excluded.labels,updated=excluded.updated""",
                (principal,actual+1,json.dumps(layout,ensure_ascii=False),json.dumps(labels,ensure_ascii=False),now))
            self.bridge.audit("orbit_v2_access_configured",{"principal_hash":principal,"revision":actual+1,
                                                            "module":module,"removed":remove,"renamed":label is not None},db)
        return {"revision":actual+1,"layout":layout,"labels":labels,"updated":now}

    def verify_metro(self, port):
        """Read-only bundle/source comparison, requested explicitly by the owner."""
        if port == 8089:
            from owner_expo import OwnerExpo
            doc = OwnerExpo(self.bridge).load()
            if not doc:
                raise ValueError("Comprobaciones 8089 no tiene versión fijada")
            sha, workspace = doc["sha"], Path(doc["workspace"])
        elif port == 8088:
            workspace = self.bridge.home.parent / "work" / "goapp"
            if not (workspace / "artifacts/go-app-mobile/package.json").is_file():
                raise ValueError("No se identifica el entorno principal de Expo")
            result = subprocess.run(["git", "-C", str(workspace), "ls-remote", "origin", "refs/heads/main"],
                                    capture_output=True, text=True, timeout=20, check=True)
            sha = result.stdout.split()[0]
        else:
            raise ValueError("Puerto ajeno a GO")
        proof = self.bridge.factory._verify_metro(sha, sha, workspace, port=port,
                                                   pinned=port == 8089, api_check=True)
        return {"port": port, "expected_sha": sha, "served_sha": proof["sha"],
                "checked_at": time.time(), "checked_sources": proof["checked_sources"],
                "bundle_bytes": proof["bundle_bytes"], "api": proof.get("api"),
                "iphone_validation": "pending"}

    def system_probe(self):
        """Small read-only checks; unauthenticated responses never prove app functions."""
        observed = {"checked_at": time.time(), "github": "sin verificar", "tailscale": "sin verificar",
                    "railway_api": "sin verificar", "supabase": "sin prueba autenticada"}
        checkout = self.bridge.home.parent / "work" / "goapp"
        if (checkout / ".git").exists():
            try:
                remote = subprocess.run(["git", "-C", str(checkout), "ls-remote", "origin", "refs/heads/main"],
                                        capture_output=True, text=True, timeout=6, check=True).stdout.split()[0]
                local = subprocess.run(["git", "-C", str(checkout), "rev-parse", "HEAD"],
                                       capture_output=True, text=True, timeout=4, check=True).stdout.strip()
                observed["github"] = "MAIN consultado" if remote == local else "MAIN remoto y carpeta local difieren"
                observed["main_sha"] = remote
            except (OSError, subprocess.SubprocessError, IndexError):
                pass
        try:
            proc = subprocess.run([r"C:\Program Files\Tailscale\tailscale.exe", "status", "--json"],
                                  capture_output=True, text=True, timeout=4, check=True)
            observed["tailscale"] = "conectado" if json.loads(proc.stdout).get("BackendState") == "Running" else "no conectado"
        except (OSError, ValueError, subprocess.SubprocessError):
            pass
        try:
            with urllib.request.urlopen("https://goapp-api-production.up.railway.app/api/supabase/booking-conversations",
                                        timeout=5) as response:
                observed["railway_api"] = "respondió; autenticación por comprobar"
        except urllib.error.HTTPError as error:
            observed["railway_api"] = "respondió; requiere autenticación" if error.code == 401 else f"respondió HTTP {error.code}"
        except (OSError, TimeoutError):
            pass
        return observed
