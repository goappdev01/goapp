import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("components/empresa/GoAdminDashboard.tsx", "utf8");

test("Admin System keeps its original screen without mounting the publication overlay", () => {
  assert.doesNotMatch(source, /import\s*\{\s*GoModulePublicationPanel\s*\}\s*from/);
  assert.doesNotMatch(source, /<GoModulePublicationPanel\s*\/>/);
  assert.match(source, /section\s*===\s*["']sistema["']\s*&&\s*<AdminScreen\s*\/>/);
});
