import { PDFDocument, rgb, type PDFImage, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";

const mm = (value: number) => value * 72 / 25.4;
const sourceWidth = 1055;
const sourceHeight = 1491;
const qrLeft = 280;
const qrTop = 657;
const qrSide = 496;
const origin = "https://goapp-api-production.up.railway.app";
export const POSTER_A6_POINTS = { width: mm(105), height: mm(148) };
export const POSTER_A4_POINTS = { width: mm(210), height: mm(297) };

export function commercialQrUrl(code: string): string {
  if (!/^(?:[0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(code))
    throw Error("Invalid commercial QR code");
  return `${origin}/api/commercial/b/${code.toLowerCase()}`;
}

function drawCropMark(page: PDFPage, x: number, y: number, horizontal: -1 | 1, vertical: -1 | 1) {
  const length = mm(2.5);
  page.drawLine({ start: { x, y }, end: { x: x + horizontal * length, y }, thickness: 0.35, color: rgb(0.2, 0.2, 0.2) });
  page.drawLine({ start: { x, y }, end: { x, y: y + vertical * length }, thickness: 0.35, color: rgb(0.2, 0.2, 0.2) });
}

function drawPoster(page: PDFPage, background: PDFImage, code: string, x: number, y: number, width: number) {
  const scale = width / sourceWidth;
  const height = sourceHeight * scale;
  page.drawImage(background, { x, y, width, height });
  // The original PNG stays byte-for-byte unchanged. This white vector patch covers
  // only its illustrative QR, leaving the cyan frame and all approved art intact.
  const side = qrSide * scale;
  const squareX = x + qrLeft * scale;
  const squareY = y + (sourceHeight - qrTop - qrSide) * scale;
  page.drawRectangle({ x: squareX, y: squareY, width: side, height: side, color: rgb(1, 1, 1) });
  const matrix = QRCode.create(commercialQrUrl(code), { errorCorrectionLevel: "M" }).modules;
  const moduleSide = side / (matrix.size + 8);
  for (let row = 0; row < matrix.size; row++) for (let column = 0; column < matrix.size; column++) {
    if (!matrix.get(row, column)) continue;
    page.drawRectangle({
      x: squareX + (column + 4) * moduleSide,
      y: squareY + side - (row + 5) * moduleSide,
      width: moduleSide + 0.01,
      height: moduleSide + 0.01,
      color: rgb(0, 0, 0),
    });
  }
  return { width, height };
}

export async function createCommercialPosterPdf(png: Uint8Array, code: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("GO - cartel comercial A6");
  const background = await pdf.embedPng(png);
  const page = pdf.addPage([POSTER_A6_POINTS.width, POSTER_A6_POINTS.height]);
  const width = POSTER_A6_POINTS.width;
  const height = width * sourceHeight / sourceWidth;
  drawPoster(page, background, code, 0, (POSTER_A6_POINTS.height - height) / 2, width);
  return pdf.save();
}

export async function createCommercialBatchPdf(png: Uint8Array, codes: string[]): Promise<Uint8Array> {
  if (!codes.length || codes.length > 1000) throw Error("Invalid QR batch");
  const pdf = await PDFDocument.create();
  pdf.setTitle("GO - lote comercial cuatro carteles por A4");
  const background = await pdf.embedPng(png);
  const width = mm(98);
  const height = width * sourceHeight / sourceWidth;
  const gapX = mm(4);
  const gapY = mm(4);
  const left = (POSTER_A4_POINTS.width - 2 * width - gapX) / 2;
  const bottom = (POSTER_A4_POINTS.height - 2 * height - gapY) / 2;
  for (let index = 0; index < codes.length; index += 4) {
    const page = pdf.addPage([POSTER_A4_POINTS.width, POSTER_A4_POINTS.height]);
    for (let slot = 0; slot < 4 && index + slot < codes.length; slot++) {
      const x = left + (slot % 2) * (width + gapX);
      const y = bottom + (1 - Math.floor(slot / 2)) * (height + gapY);
      drawPoster(page, background, codes[index + slot], x, y, width);
      drawCropMark(page, x, y, -1, -1);
      drawCropMark(page, x + width, y, 1, -1);
      drawCropMark(page, x, y + height, -1, 1);
      drawCropMark(page, x + width, y + height, 1, 1);
    }
  }
  return pdf.save();
}
