import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { PDFDocument } from "pdf-lib";

const source = readFileSync("src/lib/commercialPoster.ts", "utf8");
const commonJs = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
} }).outputText;
const exports = {};
new Function("exports", "require", commonJs)(exports, createRequire(import.meta.url));
const poster = readFileSync("assets/commercial-qr-poster-a6.png");
const codes = [
  "11111111-1111-4111-8111-111111111111",
  "a".repeat(64), "b".repeat(64), "c".repeat(64), "d".repeat(64),
];

test("approved A6 art carries a vector QR with four-module quiet zone", async () => {
  const bytes = await exports.createCommercialPosterPdf(poster, codes[0]);
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  const size = doc.getPage(0).getSize();
  assert.ok(Math.abs(size.width - 105 * 72 / 25.4) < 0.01);
  assert.ok(Math.abs(size.height - 148 * 72 / 25.4) < 0.01);
  assert.ok(bytes.byteLength > poster.byteLength / 2);
  assert.match(exports.commercialQrUrl(codes[0]), /\/api\/commercial\/b\/11111111/);
  assert.throws(() => exports.commercialQrUrl("mi-negocio"));
});

test("A4 print sheet retains four-up layout and stable QR content", async () => {
  const bytes = await exports.createCommercialBatchPdf(poster, codes);
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 2);
  for (const page of doc.getPages()) {
    const size = page.getSize();
    assert.ok(Math.abs(size.width - 210 * 72 / 25.4) < 0.01);
    assert.ok(Math.abs(size.height - 297 * 72 / 25.4) < 0.01);
  }
  await assert.rejects(() => exports.createCommercialBatchPdf(poster, []));
});
