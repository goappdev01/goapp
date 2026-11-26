import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { CatalogImportError, extractCatalogText, type ImportedService } from "./catalogImport";

const runFile = promisify(execFile);
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PAGES = 10;
let active = 0;

/** Rejoin OCR words by their physical row, including separate name/price columns. */
export function catalogTsvText(tsv: string): string {
  const words = tsv.split(/\r?\n/).slice(1).map(line => line.split("\t"))
    .filter(columns => columns[0] === "5" && columns.length >= 12 && columns.slice(11).join("\t").trim())
    .map(columns => ({ x: Number(columns[6]), y: Number(columns[7]), h: Number(columns[9]),
      text: columns.slice(11).join("\t").trim() }))
    .filter(word => Number.isFinite(word.x) && Number.isFinite(word.y) && word.h > 0);
  const lines: { y: number; h: number; words: typeof words }[] = [];
  for (const word of words.sort((a, b) => a.y - b.y || a.x - b.x)) {
    let row = lines.find(line => Math.abs((line.y + line.h / 2) - (word.y + word.h / 2)) <= Math.min(line.h, word.h) * 0.5);
    if (!row) { row = { y: word.y, h: word.h, words: [] }; lines.push(row); }
    row.words.push(word);
  }
  return lines.sort((a, b) => a.y - b.y).map(line => line.words.sort((a, b) => a.x - b.x).map(word => word.text).join(" ")).join("\n");
}

function imageDimensions(bytes: Buffer, mime: string): { width: number; height: number } | null {
  if (mime === "image/png" && bytes.length >= 24) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (mime !== "image/jpeg") return null;
  for (let at = 2; at + 9 < bytes.length;) {
    if (bytes[at] !== 255) return null;
    const marker = bytes[at + 1];
    if (marker === 0xd9 || marker === 0xda) return null;
    const size = bytes.readUInt16BE(at + 2);
    if (size < 2 || at + 2 + size > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker))
      return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
    at += size + 2;
  }
  return null;
}

function run(command: string, args: string[], timeout = 12000): Promise<{ stdout: string }> {
  return runFile(command, args, { timeout, maxBuffer: 2 * 1024 * 1024, windowsHide: true, encoding: "utf8" });
}

export function catalogDocumentBytes(source: "image" | "pdf", mime: string, encoded: string): Buffer {
  if (typeof encoded !== "string" || encoded.length > Math.ceil(MAX_BYTES * 4 / 3) + 4
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
    throw new CatalogImportError("CATALOG_FILE_INVALID", "El archivo no es válido o supera 5 MB.");
  const bytes = Buffer.from(encoded, "base64");
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const pdf = bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  if (!bytes.length || bytes.length > MAX_BYTES || !(source === "pdf" && mime === "application/pdf" && pdf
    || source === "image" && (mime === "image/png" && png || mime === "image/jpeg" && jpeg)))
    throw new CatalogImportError("CATALOG_FILE_INVALID", "Adjunta un PDF, JPG o PNG de hasta 5 MB.");
  if (source === "image") {
    const dimensions = imageDimensions(bytes, mime);
    if (!dimensions || dimensions.width < 100 || dimensions.height < 100
      || dimensions.width > 6000 || dimensions.height > 6000
      || dimensions.width * dimensions.height > 20_000_000)
      throw new CatalogImportError("CATALOG_IMAGE_SIZE", "La fotografía debe tener una resolución moderada. Prueba otra imagen.");
  }
  return bytes;
}

export async function catalogDocumentCapabilities(): Promise<{ image: boolean; pdf: boolean }> {
  const image = await run("tesseract", ["--version"], 3000).then(() => true, () => false);
  const pdf = image && await Promise.all([run("pdfinfo", ["-v"], 3000), run("pdftotext", ["-v"], 3000), run("pdftoppm", ["-v"], 3000)])
    .then(() => true, () => false);
  return { image, pdf };
}

async function readPages(path: string, directory: string): Promise<{ text: string; ocrPages: number }> {
  const deadline = Date.now() + 90_000;
  const { stdout } = await run("pdfinfo", [path]);
  const count = Number(stdout.match(/^Pages:\s*(\d+)/mi)?.[1] ?? 0);
  if (!Number.isInteger(count) || count < 1 || count > MAX_PAGES)
    throw new CatalogImportError("CATALOG_PAGES_INVALID", `El PDF debe tener entre 1 y ${MAX_PAGES} páginas.`);
  const pages: string[] = [];
  let ocrPages = 0;
  for (let page = 1; page <= count; page++) {
    if (Date.now() >= deadline) throw new CatalogImportError("CATALOG_TIMEOUT", "La lectura del documento tardó demasiado.");
    const extracted = await run("pdftotext", ["-f", String(page), "-l", String(page), "-layout", "-enc", "UTF-8", path, "-"], Math.min(12000, deadline - Date.now()));
    let text = extracted.stdout;
    // OCR only the pages without enough reliable priced rows, including mixed PDFs.
    if (extractCatalogText(text).length === 0) {
      const prefix = join(directory, `page-${page}`);
      await run("pdftoppm", ["-f", String(page), "-l", String(page), "-singlefile", "-scale-to", "2200", "-png", path, prefix], Math.min(20000, deadline - Date.now()));
      text = catalogTsvText((await run("tesseract", [`${prefix}.png`, "stdout", "-l", "spa+eng", "--psm", "1", "tsv"], Math.min(20000, deadline - Date.now()))).stdout);
      ocrPages++;
    }
    pages.push(text);
  }
  return { text: pages.join("\n"), ocrPages };
}

/** Untrusted documents stay in a private temporary directory and are never logged or retained. */
export async function extractCatalogDocument(source: "image" | "pdf", mime: string, encoded: string): Promise<{
  services: ImportedService[]; method: "ocr" | "direct" | "mixed";
}> {
  const bytes = catalogDocumentBytes(source, mime, encoded);
  if (active >= 2) throw new CatalogImportError("CATALOG_BUSY", "Hay otra lectura en curso. Inténtalo en un momento.");
  active++;
  let directory: string | undefined;
  try {
    directory = await mkdtemp(join(tmpdir(), "go-catalog-"));
    const path = join(directory, source === "pdf" ? "source.pdf" : mime === "image/png" ? "source.png" : "source.jpg");
    await writeFile(path, bytes, { mode: 0o600 });
    let text: string, method: "ocr" | "direct" | "mixed";
    if (source === "image") {
      text = catalogTsvText((await run("tesseract", [path, "stdout", "-l", "spa+eng", "--psm", "1", "tsv"], 20000)).stdout);
      method = "ocr";
    } else {
      const pages = await readPages(path, directory);
      text = pages.text;
      method = pages.ocrPages === 0 ? "direct" : "mixed";
    }
    return { services: extractCatalogText(text), method };
  } catch (error) {
    if (error instanceof CatalogImportError) throw error;
    throw new CatalogImportError("CATALOG_DOCUMENT_FAILED", "No se pudo leer el documento. Comprueba que no esté protegido y vuelve a intentarlo.");
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
    active--;
  }
}
