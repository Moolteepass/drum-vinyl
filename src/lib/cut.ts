import { circleRing, intersection, normalize, offset, placeRings, signedArea, type Rings } from "./geometry";
import { placementOf, type Drum, type Sticker } from "../model";

/** Concave corners are rounded to at least this radius (mm) so the blade turns smoothly. */
const SMOOTH_MM = 1;
/** Bits of image smaller than this (mm²) are too small to weed, so they're dropped. */
const MIN_ISLAND_MM2 = 4;
/** Gaps smaller than this (mm²) are always filled. */
const MIN_GAP_MM2 = 9;

export interface Cut {
  /** Cut line in image pixels (same space as the outline). */
  rings: Rings;
  /** Enclosed gaps found inside the cut line, before the fill-gaps choice is applied. */
  gapCount: number;
}

/** Grow the traced outline by the border, round it off, and handle enclosed gaps. */
export function computeCut(outline: Rings, scale: number, border: number, fillGaps: boolean): Cut {
  if (!outline.length || scale <= 0) return { rings: [], gapCount: 0 };
  const pxPerMm = 1 / scale;
  const tolerance = 0.05 * pxPerMm;

  // Grow past the border, then shrink back: this "closing" also rounds inside corners.
  let rings = offset(outline, (border + SMOOTH_MM) * pxPerMm, tolerance);
  rings = offset(rings, -SMOOTH_MM * pxPerMm, tolerance);

  const minIsland = MIN_ISLAND_MM2 * pxPerMm ** 2;
  const minGap = MIN_GAP_MM2 * pxPerMm ** 2;
  const outers = rings.filter((r) => signedArea(r) >= minIsland);
  const gaps = rings.filter((r) => -signedArea(r) >= minGap);

  return {
    // Filling gaps: keep only outer rings and merge any islands that sat inside gaps.
    rings: fillGaps || !gaps.length ? normalize(outers, "nonzero") : [...outers, ...gaps],
    gapCount: gaps.length,
  };
}

export interface CutPlan {
  /** Cut line on the drum head in mm, clipped to the edge margin. */
  rings: Rings;
  /** True if the margin trims part of the sticker. */
  trimmed: boolean;
}

/** Place the cut line on the head in millimetres and clip it to the usable area. */
export function planCut(sticker: Sticker, cut: Cut, drum: Drum): CutPlan {
  const usableR = Math.max(drum.diameter / 2 - drum.margin, 0.1);
  const placed = placeRings(cut.rings, placementOf(sticker));
  const trimmed = placed.some((ring) => ring.some(([x, y]) => x * x + y * y > usableR * usableR));
  return { rings: trimmed ? intersection(placed, [circleRing(usableR, 0.005)]) : placed, trimmed };
}

/** Max print file edge. iOS Safari refuses canvases over ~16.7 megapixels. */
const MAX_PRINT_PX = 4096;
const TARGET_DPI = 300;

/**
 * Render the print file: a square PNG covering the whole head, with the image
 * clipped to the cut line. It shares the DXF's frame, so they line up exactly.
 */
export async function renderPrintPng(
  img: HTMLImageElement,
  sticker: Sticker,
  plan: CutPlan,
  drum: Drum,
): Promise<{ blob: Blob; dpi: number }> {
  const inches = drum.diameter / 25.4;
  const size = Math.min(MAX_PRINT_PX, Math.round(inches * TARGET_DPI));
  const pxPerMm = size / drum.diameter;
  const dpi = size / inches;

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";

  // Head coordinates (mm, centre origin) → canvas pixels.
  ctx.setTransform(pxPerMm, 0, 0, pxPerMm, size / 2, size / 2);
  const path = new Path2D();
  for (const ring of plan.rings) {
    ring.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
    path.closePath();
  }
  ctx.clip(path, "evenodd");

  const p = placementOf(sticker);
  ctx.translate(p.x, p.y);
  ctx.rotate((p.rotation * Math.PI) / 180);
  ctx.scale(p.flipX ? -p.scale : p.scale, p.flipY ? -p.scale : p.scale);
  ctx.drawImage(img, -sticker.imageWidth / 2, -sticker.imageHeight / 2, sticker.imageWidth, sticker.imageHeight);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't create the print file."))), "image/png"),
  );
  return { blob: await withDpi(blob, dpi), dpi };
}

/** Add a pHYs chunk so design software imports the PNG at its real physical size. */
async function withDpi(png: Blob, dpi: number): Promise<Blob> {
  const bytes = new Uint8Array(await png.arrayBuffer());
  const ppm = Math.round(dpi / 0.0254); // pixels per metre
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9); // data length
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1; // unit: metre
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  // The 8-byte signature and 25-byte IHDR chunk always come first.
  return new Blob([bytes.subarray(0, 33), chunk, bytes.subarray(33)], { type: "image/png" });
}

let crcTable: Uint32Array | null = null;
function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of data) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
