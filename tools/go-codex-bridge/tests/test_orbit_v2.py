"""V2 tests use only an isolated SQLite file and synthetic identities."""
from contextlib import contextmanager
import sqlite3
import tempfile
from pathlib import Path
import unittest
from unittest.mock import Mock,patch

from orbit_v2 import OrbitV2, DEFAULT, REGISTRY, relocate, validate, guide


class FakeBridge:
    def __init__(self, root):
        self.home = Path(root)
        self.database = Path(root) / "isolated.sqlite3"
        self.events = []

    @contextmanager
    def db(self):
        connection = sqlite3.connect(self.database)
        connection.row_factory = sqlite3.Row
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def audit(self, event, data, db):
        self.events.append((event, data))


class OrbitTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.bridge = FakeBridge(self.tmp.name)
        self.store = OrbitV2(self.bridge)
        self.alice = "a" * 64
        self.bob = "b" * 64

    def tearDown(self):
        self.tmp.cleanup()

    def test_default_seven_and_eighth_reserved_for_other(self):
        state = self.store.state(self.alice)
        self.assertEqual(len(state["layout"]), 1)
        self.assertEqual(len(state["layout"][0]), 7)
        self.assertEqual(state["revision"], 0)
        self.assertEqual(len(REGISTRY), 10)

    def test_insert_shifts_without_swapping_and_creates_orbit(self):
        result = self.store.move(self.alice, 0, "diagnostics", 0, 2)
        self.assertEqual(result["layout"][0][2], "diagnostics")
        self.assertEqual(result["layout"][0][3], DEFAULT[0][2])
        self.assertEqual(result["layout"][1], [DEFAULT[0][-1]])
        self.assertEqual(len(set(sum(result["layout"], []))), 8)
        moved = self.store.move(self.alice, 1, "factory", 1, 0)
        self.assertEqual(moved["layout"][1][0], "factory")
        self.assertNotIn("factory", moved["layout"][0])

    def test_cascade_to_third_orbit_and_reject_overflow_limit(self):
        first = relocate(DEFAULT, "diagnostics", 0, 0)
        second = relocate(first, "permissions", 0, 0)
        third = relocate(second, "history", 0, 0)
        self.assertEqual(sum(map(len, third)), 10)
        self.assertEqual(third[0][:3], ["history", "permissions", "diagnostics"])
        self.assertEqual(len(third[0]), 7)
        self.assertEqual(len(third[1]), 3)
        self.assertRaises(ValueError, validate, [["factory", "factory"]])

    def test_revision_and_owner_isolation_survive_reopen(self):
        self.store.move(self.alice, 0, "diagnostics", 1, 0)
        with self.assertRaises(ValueError):
            self.store.move(self.alice, 0, "history", 0, 0)
        self.assertEqual(self.store.state(self.bob)["revision"], 0)
        reopened = OrbitV2(self.bridge)
        self.assertEqual(reopened.state(self.alice)["layout"][1], ["diagnostics"])
        self.assertEqual(reopened.state(self.bob)["layout"], DEFAULT)

    def test_rename_and_remove_do_not_change_function_or_permissions(self):
        renamed = self.store.configure(self.alice, 0, "factory", label="Mi fábrica")
        self.assertEqual(renamed["labels"]["factory"], "Mi fábrica")
        self.assertEqual(renamed["layout"], DEFAULT)
        removed = self.store.configure(self.alice, 1, "factory", remove=True)
        self.assertNotIn("factory", removed["layout"][0])
        self.assertIn("factory", REGISTRY)
        self.assertRaises(ValueError, self.store.configure, self.alice, 1, "expo", label="Otra")
        self.assertRaises(ValueError, self.store.configure, self.alice, 2, "expo", label="<script>")

    def test_copilot_uses_current_positions_and_no_effects(self):
        layout = relocate(DEFAULT, "factory", 1, 0)
        answer = guide("¿Dónde puedo activar fábrica?", layout, {"factory": "PAUSADA"})
        self.assertIn("Órbita 2, posición 1", answer)
        self.assertIn("requieren la revisión", answer)
        self.assertIn("PAUSADA", answer)
        self.assertEqual(self.store.state(self.alice)["revision"], 0)

    def test_metro_probe_never_substitutes_another_port_or_claims_iphone(self):
        self.bridge.factory = Mock()
        self.bridge.factory._verify_metro.return_value = {
            "sha": "a" * 40, "checked_sources": 12, "bundle_bytes": 2000}
        with patch("owner_expo.OwnerExpo.load", return_value={"sha": "a" * 40,
                "workspace": self.tmp.name, "port": 8089}):
            proof = self.store.verify_metro(8089)
        self.assertEqual(proof["served_sha"], "a" * 40)
        self.assertEqual(proof["iphone_validation"], "pending")
        self.assertEqual(self.bridge.factory._verify_metro.call_args.kwargs["port"], 8089)
        self.assertTrue(self.bridge.factory._verify_metro.call_args.kwargs["pinned"])
        self.assertRaises(ValueError, self.store.verify_metro, 8090)


if __name__ == "__main__":
    unittest.main()
