import * as ClipperLib from "clipper-lib";

/** A point as [x, y]. */
export type Pt = [number, number];
/** A closed ring of points (the last point is NOT repeated). */
export type Ring = Pt[];
/**
 * A filled shape made of rings. Rings come out of Clipper, so they never
 * overlap: outer rings run one way, holes the other, and fill-rule="evenodd" draws them.
 */
export type Rings = Ring[];

/** Clipper works on integers, so coordinates are multiplied by this first. */
const SCALE = 100;

function toClipper(rings: Rings): ClipperLib.Paths {
  return rings.map((ring) =>
    ring.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) })),
  );
}

function fromClipper(paths: ClipperLib.Paths): Rings {
  return paths
    .filter((p) => p.length >= 3)
    .map((p) => p.map((pt) => [pt.X / SCALE, pt.Y / SCALE] as Pt));
}

function execute(op: ClipperLib.ClipType, subject: Rings, clip: Rings, fill: ClipperLib.PolyFillType): Rings {
  const c = new ClipperLib.Clipper();
  c.AddPaths(toClipper(subject), ClipperLib.PolyType.ptSubject, true);
  c.AddPaths(toClipper(clip), ClipperLib.PolyType.ptClip, true);
  const out: ClipperLib.Paths = [];
  c.Execute(op, out, fill, fill);
  return fromClipper(out);
}

/** Merge rings into clean non-overlapping outers + holes. */
export const normalize = (rings: Rings, rule: "evenodd" | "nonzero") =>
  execute(
    ClipperLib.ClipType.ctUnion,
    rings,
    [],
    rule === "evenodd" ? ClipperLib.PolyFillType.pftEvenOdd : ClipperLib.PolyFillType.pftNonZero,
  );

export const intersection = (a: Rings, b: Rings) =>
  execute(ClipperLib.ClipType.ctIntersection, a, b, ClipperLib.PolyFillType.pftNonZero);

/**
 * Grow (positive delta) or shrink (negative) a shape with rounded corners.
 * `arcTolerance` is how far the rounded corners may stray from a true arc.
 */
export function offset(rings: Rings, delta: number, arcTolerance: number): Rings {
  if (delta === 0) return rings;
  const co = new ClipperLib.ClipperOffset(2, Math.max(arcTolerance * SCALE, 0.25));
  co.AddPaths(toClipper(rings), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const out: ClipperLib.Paths = [];
  // The typings only list the PolyTree overload, but Paths works too.
  (co.Execute as unknown as (s: ClipperLib.Paths, d: number) => void)(out, delta * SCALE);
  return fromClipper(out);
}

/** Signed area: positive for outer rings, negative for holes (Clipper's convention). */
export function signedArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return -a / 2;
}

/** A polygon approximating a circle, accurate to within `tolerance`. */
export function circleRing(r: number, tolerance = 0.01): Ring {
  // Segment count so the chord sagitta stays below the tolerance.
  const n = Math.max(64, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - tolerance / r))));
  const ring: Ring = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ring.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return ring;
}

/** SVG path data for a set of rings (draw with fill-rule="evenodd"). */
export function ringsToPathData(rings: Rings, precision = 2): string {
  const f = (n: number) => +n.toFixed(precision);
  return rings
    .map((ring) => "M" + ring.map(([x, y]) => `${f(x)} ${f(y)}`).join("L") + "Z")
    .join("");
}

/** Placement of the sticker on the drum head, in millimetres and degrees. */
export interface Placement {
  x: number;
  y: number;
  /** Uniform scale from image pixels to millimetres. */
  scale: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
}

/** Map rings in image pixels into drum-head millimetres. */
export function placeRings(rings: Rings, p: Placement): Rings {
  const rad = (p.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const sx = p.scale * (p.flipX ? -1 : 1);
  const sy = p.scale * (p.flipY ? -1 : 1);
  return rings.map((ring) =>
    ring.map(([x, y]) => {
      const lx = x * sx;
      const ly = y * sy;
      return [p.x + lx * cos - ly * sin, p.y + lx * sin + ly * cos] as Pt;
    }),
  );
}
