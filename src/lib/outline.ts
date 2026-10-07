import { normalize, type Pt, type Ring, type Rings } from "./geometry";

/** The mask is traced at this size; the outline is smoothed afterwards anyway. */
const MASK_PX = 1000;
/** Pixels at least this opaque (0–1) are kept inside the cut, so faint edges aren't clipped. */
const INK_THRESHOLD = 0.2;
/** Width (in RGB distance) of the soft edge around the background tolerance. */
const BACKGROUND_SOFTNESS = 24;

export type RGB = [number, number, number];

export interface ImageInfo {
  width: number;
  height: number;
  /** True if the image has see-through pixels to trace around. */
  hasAlpha: boolean;
  /** The colour in the corners, assumed to be the background. */
  background: RGB;
}

export interface OutlineOptions {
  /** Treat pixels close to `background` as empty (for JPEGs and other opaque images). */
  removeBackground: boolean;
  background: RGB;
  /** 0–255: how different from the background a pixel must be to count as image. */
  tolerance: number;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image."));
    img.src = src;
  });
}

/** Draw the image small enough to analyse quickly. */
function sample(img: HTMLImageElement) {
  const k = Math.min(1, MASK_PX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, w, h };
}

export function analyzeImage(img: HTMLImageElement): ImageInfo {
  const { data, w, h } = sample(img);
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) transparent++;

  // Median colour of 4×4 patches in each corner.
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (const [cx, cy] of [
    [0, 0],
    [w - 4, 0],
    [0, h - 4],
    [w - 4, h - 4],
  ]) {
    for (let y = Math.max(cy, 0); y < Math.min(cy + 4, h); y++)
      for (let x = Math.max(cx, 0); x < Math.min(cx + 4, w); x++) {
        const i = (y * w + x) * 4;
        rs.push(data[i]);
        gs.push(data[i + 1]);
        bs.push(data[i + 2]);
      }
  }
  const median = (v: number[]) => v.sort((a, b) => a - b)[v.length >> 1];

  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
    hasAlpha: transparent > w * h * 0.001,
    background: [median(rs), median(gs), median(bs)],
  };
}

/**
 * Trace the outline of the image's visible pixels.
 * Returns rings in original-image pixels, centred on the image centre.
 */
export function traceOutline(img: HTMLImageElement, options: OutlineOptions): Rings {
  const { data, w, h } = sample(img);
  const [br, bg, bb] = options.background;

  // How much each pixel belongs to the image, 0–1. Using the anti-aliased alpha
  // (rather than a hard yes/no) gives smooth, sub-pixel edges.
  // Padded by 1px of empty so every outline closes.
  const W = w + 2;
  const H = h + 2;
  const field = new Float32Array(W * H);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let v = data[i + 3] / 255;
      if (options.removeBackground) {
        const d = Math.hypot(data[i] - br, data[i + 1] - bg, data[i + 2] - bb);
        // Soft ramp around the tolerance so JPEG edge pixels blend smoothly.
        v *= Math.min(1, Math.max(0, (d - options.tolerance) / BACKGROUND_SOFTNESS + 0.5));
      }
      field[(y + 1) * W + x + 1] = v;
    }

  const loops = marchingSquares(field, W, H, INK_THRESHOLD);

  // Back to original image pixels, centred, with the padding removed.
  const k = img.naturalWidth / w;
  const cx = img.naturalWidth / 2;
  const cy = img.naturalHeight / 2;
  const rings = loops
    .map((loop) => simplify(loop, 0.35).map(([x, y]) => [(x - 1) * k - cx, (y - 1) * k - cy] as Pt))
    .filter((r) => r.length >= 3);

  // Nested loops alternate outer/hole, which is exactly even-odd filling.
  return normalize(rings, "evenodd");
}

/**
 * Marching squares: find every closed contour where `field` crosses `iso`.
 * Edge crossings are linearly interpolated, so outlines are sub-pixel accurate.
 */
function marchingSquares(field: Float32Array, W: number, H: number, iso: number): Ring[] {
  // Each crossing lives on a grid edge: horizontal edges get even ids, vertical odd.
  const hEdge = (x: number, y: number) => (y * W + x) * 2;
  const vEdge = (x: number, y: number) => (y * W + x) * 2 + 1;
  const links = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    let la = links.get(a);
    if (!la) links.set(a, (la = []));
    la.push(b);
    let lb = links.get(b);
    if (!lb) links.set(b, (lb = []));
    lb.push(a);
  };

  for (let y = 0; y < H - 1; y++)
    for (let x = 0; x < W - 1; x++) {
      const tl = field[y * W + x];
      const tr = field[y * W + x + 1];
      const br = field[(y + 1) * W + x + 1];
      const bl = field[(y + 1) * W + x];
      const c = (tl > iso ? 8 : 0) | (tr > iso ? 4 : 0) | (br > iso ? 2 : 0) | (bl > iso ? 1 : 0);
      if (c === 0 || c === 15) continue;
      const T = hEdge(x, y);
      const B = hEdge(x, y + 1);
      const L = vEdge(x, y);
      const R = vEdge(x + 1, y);
      const centreIn = (tl + tr + br + bl) / 4 > iso;
      switch (c) {
        case 1: case 14: link(L, B); break;
        case 2: case 13: link(B, R); break;
        case 3: case 12: link(L, R); break;
        case 4: case 11: link(T, R); break;
        case 6: case 9: link(T, B); break;
        case 7: case 8: link(T, L); break;
        case 5:
          if (centreIn) { link(T, L); link(B, R); } else { link(T, R); link(L, B); }
          break;
        case 10:
          if (centreIn) { link(T, R); link(L, B); } else { link(T, L); link(B, R); }
          break;
      }
    }

  const point = (id: number): Pt => {
    const cell = id >> 1;
    const x = cell % W;
    const y = (cell - x) / W;
    const a = field[cell];
    if ((id & 1) === 0) {
      const b = field[cell + 1];
      return [x + (iso - a) / (b - a), y];
    }
    const b = field[cell + W];
    return [x, y + (iso - a) / (b - a)];
  };

  // Walk each chain of linked edges until it returns to its start.
  const loops: Ring[] = [];
  const visited = new Set<number>();
  for (const start of links.keys()) {
    if (visited.has(start)) continue;
    const loop: Ring = [];
    let prev = -1;
    let cur = start;
    while (!visited.has(cur)) {
      visited.add(cur);
      loop.push(point(cur));
      const next = links.get(cur)!.find((n) => n !== prev && !visited.has(n));
      if (next === undefined) break;
      prev = cur;
      cur = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** Ramer–Douglas–Peucker: drop points that sit within `tolerance` of a straight line. */
function simplify(ring: Ring, tolerance: number): Ring {
  if (ring.length < 8) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack: [number, number][] = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = ring[a];
    const [bx, by] = ring[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let maxD = 0;
    let index = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - ring[i][1]) - (ax - ring[i][0]) * (by - ay)) / len;
      if (d > maxD) {
        maxD = d;
        index = i;
      }
    }
    if (maxD > tolerance) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}
