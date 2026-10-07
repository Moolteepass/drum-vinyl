import { memo, useEffect, useMemo, useRef, useState, type Dispatch, type PointerEvent } from "react";
import { ringsToPathData, type Pt, type Rings } from "../lib/geometry";
import { heightOf, type Action, type Drum, type Sticker } from "../model";

interface Props {
  drum: Drum;
  sticker: Sticker | null;
  imageUrl: string | null;
  /** Cut line in image pixels (for clipping the image). */
  cutLocal: Rings;
  /** Cut line on the head in mm, exactly as exported. */
  cutPlaced: Rings;
  selected: boolean;
  dispatch: Dispatch<Action>;
}

/** What the current pointer interaction is doing. */
type Gesture =
  | { kind: "tap-empty"; start: Pt }
  | { kind: "drag"; start: Pt; origin: Pt }
  | { kind: "scale"; startDist: number; startWidth: number }
  | { kind: "rotate" }
  | {
      kind: "pinch";
      startDist: number;
      startAngle: number;
      startMid: Pt;
      origin: Pt;
      startWidth: number;
      startRotation: number;
    };

const SNAP_PX = 8;
const HANDLE_PX = 11;
const ROTATE_ARM_PX = 28;
const MIN_WIDTH_MM = 5;
const CUT_COLOR = "#ff2d55";

export function DrumCanvas({ drum, sticker, imageUrl, cutLocal, cutPlaced, selected, dispatch }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<Gesture | null>(null);
  const [guides, setGuides] = useState({ v: false, h: false });
  const [pxPerMm, setPxPerMm] = useState(1);

  const R = drum.diameter / 2;
  const hoop = Math.max(12, drum.diameter * 0.035);
  const extent = R + hoop + Math.max(10, drum.diameter * 0.03);
  const usableR = Math.max(R - drum.margin, 0);

  // Keep handles a constant on-screen size whatever the drum size or window size.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const ro = new ResizeObserver(() => {
      const r = svg.getBoundingClientRect();
      setPxPerMm(Math.min(r.width, r.height) / (2 * extent) || 1);
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, [extent]);

  const toMm = (clientX: number, clientY: number): Pt => {
    const m = svgRef.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(clientX, clientY).matrixTransform(m);
    return [p.x, p.y];
  };

  const update = (patch: Partial<Sticker>) => dispatch({ type: "update", patch });
  const clampWidth = (w: number) => Math.min(Math.max(w, MIN_WIDTH_MM), drum.diameter * 1.5);

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const p = toMm(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, p);
    svgRef.current!.setPointerCapture(e.pointerId);

    // A second finger anywhere turns the gesture into pinch-to-scale and twist-to-rotate.
    if (pointers.current.size === 2 && sticker) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        kind: "pinch",
        startDist: Math.max(dist(a, b), 1e-6),
        startAngle: angleDeg(a, b),
        startMid: mid(a, b),
        origin: [sticker.x, sticker.y],
        startWidth: sticker.width,
        startRotation: sticker.rotation,
      };
      setGuides({ v: false, h: false });
      return;
    }
    if (pointers.current.size > 1) return;

    const role = (e.target as Element).closest<SVGElement>("[data-role]")?.dataset.role;
    if (role === "sticker" && sticker) {
      if (!selected) dispatch({ type: "select", selected: true });
      gesture.current = { kind: "drag", start: p, origin: [sticker.x, sticker.y] };
    } else if (role === "scale" && sticker) {
      gesture.current = {
        kind: "scale",
        startDist: Math.max(dist(p, [sticker.x, sticker.y]), 1e-6),
        startWidth: sticker.width,
      };
    } else if (role === "rotate" && sticker) {
      gesture.current = { kind: "rotate" };
    } else {
      gesture.current = { kind: "tap-empty", start: p };
    }
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = toMm(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g || !sticker) return;

    if (g.kind === "drag") {
      const snap = SNAP_PX / pxPerMm;
      let x = g.origin[0] + p[0] - g.start[0];
      let y = g.origin[1] + p[1] - g.start[1];
      const v = Math.abs(x) < snap;
      const h = Math.abs(y) < snap;
      if (v) x = 0;
      if (h) y = 0;
      setGuides((prev) => (prev.v === v && prev.h === h ? prev : { v, h }));
      update({ x, y });
    } else if (g.kind === "scale") {
      update({ width: clampWidth((g.startWidth * dist(p, [sticker.x, sticker.y])) / g.startDist) });
    } else if (g.kind === "rotate") {
      // The handle sits above the sticker, so "up" is 0°.
      const raw = (Math.atan2(p[1] - sticker.y, p[0] - sticker.x) * 180) / Math.PI + 90;
      update({ rotation: snapAngle(normalizeAngle(raw), 4) });
    } else if (g.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const m = mid(a, b);
      update({
        width: clampWidth((g.startWidth * dist(a, b)) / g.startDist),
        rotation: snapAngle(normalizeAngle(g.startRotation + angleDeg(a, b) - g.startAngle), 2.5),
        x: g.origin[0] + m[0] - g.startMid[0],
        y: g.origin[1] + m[1] - g.startMid[1],
      });
    }
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = toMm(e.clientX, e.clientY);
    pointers.current.delete(e.pointerId);
    const g = gesture.current;

    // Tapping the background deselects, unless the finger moved.
    if (g?.kind === "tap-empty" && e.type === "pointerup" && dist(p, g.start) * pxPerMm < 6) {
      dispatch({ type: "select", selected: false });
    }
    if (g?.kind === "pinch" && pointers.current.size === 1 && sticker) {
      // Lifting one finger of a pinch continues as a drag with the other.
      const [rest] = pointers.current.values();
      gesture.current = { kind: "drag", start: rest, origin: [sticker.x, sticker.y] };
      return;
    }
    if (pointers.current.size === 0) {
      gesture.current = null;
      setGuides({ v: false, h: false });
    }
  };

  // Trackpad pinch arrives as ctrl+wheel on desktop browsers.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !sticker) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      dispatch({
        type: "update",
        patch: {
          width: Math.min(Math.max(sticker.width * Math.exp(-e.deltaY * 0.01), MIN_WIDTH_MM), drum.diameter * 1.5),
        },
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [sticker, drum.diameter, dispatch]);

  const localPath = useMemo(() => ringsToPathData(cutLocal, 1), [cutLocal]);
  const placedPath = useMemo(() => ringsToPathData(cutPlaced, 3), [cutPlaced]);
  const ink = drum.finish === "coated" ? "0 0 0" : "255 255 255";

  let stickerArt = null;
  if (sticker && imageUrl) {
    const s = sticker.width / sticker.imageWidth;
    const transform = `translate(${sticker.x} ${sticker.y}) rotate(${sticker.rotation}) scale(${sticker.flipX ? -s : s} ${sticker.flipY ? -s : s})`;
    const art = (
      <g transform={transform}>
        {/* White vinyl inside the cut line, then the untouched image clipped to it. */}
        <path d={localPath} fill="#fff" fillRule="evenodd" />
        <image
          href={imageUrl}
          x={-sticker.imageWidth / 2}
          y={-sticker.imageHeight / 2}
          width={sticker.imageWidth}
          height={sticker.imageHeight}
          preserveAspectRatio="none"
          clipPath="url(#cut)"
        />
      </g>
    );
    stickerArt = (
      <>
        <defs>
          <clipPath id="cut">
            <path d={localPath} clipRule="evenodd" />
          </clipPath>
        </defs>
        {/* Faint copy shows what the edge margin trims off. */}
        <g opacity={0.25} pointerEvents="none">
          {art}
        </g>
        <g clipPath="url(#usable)" pointerEvents="none">
          {art}
        </g>
      </>
    );
  }

  const box = sticker ? { w: sticker.width + sticker.border * 2, h: heightOf(sticker) + sticker.border * 2 } : null;

  return (
    <svg
      ref={svgRef}
      viewBox={`${-extent} ${-extent} ${extent * 2} ${extent * 2}`}
      className="size-full touch-none select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="img"
      aria-label={`Drum head, ${Math.round(drum.diameter)} millimetres`}
    >
      <defs>
        <clipPath id="usable">
          <circle r={usableR} />
        </clipPath>
      </defs>

      <DrumHead drum={drum} hoop={hoop} ink={ink} pxPerMm={pxPerMm} />

      {stickerArt}

      {/* The cut line, exactly as it will be exported. */}
      {sticker && (
        <path
          d={placedPath}
          fill="none"
          stroke={CUT_COLOR}
          strokeWidth={1.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}

      {/* Invisible hit area, at least 44pt, so the sticker is easy to grab. */}
      {sticker && box && (
        <rect
          data-role="sticker"
          x={-Math.max(box.w, 44 / pxPerMm) / 2}
          y={-Math.max(box.h, 44 / pxPerMm) / 2}
          width={Math.max(box.w, 44 / pxPerMm)}
          height={Math.max(box.h, 44 / pxPerMm)}
          fill="transparent"
          transform={`translate(${sticker.x} ${sticker.y}) rotate(${sticker.rotation})`}
          className="cursor-move"
        />
      )}

      {(guides.v || guides.h) && (
        <g stroke="var(--ios-accent)" strokeWidth={1} pointerEvents="none">
          {guides.v && <line x1={0} y1={-R} x2={0} y2={R} vectorEffect="non-scaling-stroke" />}
          {guides.h && <line x1={-R} y1={0} x2={R} y2={0} vectorEffect="non-scaling-stroke" />}
        </g>
      )}

      {sticker && box && selected && (
        <SelectionBox
          x={sticker.x}
          y={sticker.y}
          rotation={sticker.rotation}
          w={box.w}
          h={box.h}
          handle={HANDLE_PX / pxPerMm}
          arm={ROTATE_ARM_PX / pxPerMm}
        />
      )}
    </svg>
  );
}

const DrumHead = memo(function DrumHead({
  drum,
  hoop,
  ink,
  pxPerMm,
}: {
  drum: Drum;
  hoop: number;
  ink: string;
  pxPerMm: number;
}) {
  const R = drum.diameter / 2;
  const usableR = Math.max(R - drum.margin, 0);
  const lugs = drum.diameter < 340 ? 6 : drum.diameter < 380 ? 8 : 10;
  const line = 1 / pxPerMm;

  // Ruler ticks along both centre lines: every 10 mm, longer every 50 mm.
  const ticks = useMemo(() => {
    let d = "";
    for (let mm = 10; mm < R; mm += 10) {
      const len = mm % 50 === 0 ? 5 : 2.5;
      for (const s of [-1, 1]) d += `M${s * mm} ${-len}V${len}M${-len} ${s * mm}H${len}`;
    }
    return d;
  }, [R]);

  const headFill =
    drum.finish === "coated" ? "url(#coated)" : drum.finish === "black" ? "url(#blackHead)" : "url(#clearHead)";

  return (
    <g pointerEvents="none">
      <defs>
        <radialGradient id="coated">
          <stop offset="0" stopColor="#fbfaf6" />
          <stop offset="1" stopColor="#ece9e1" />
        </radialGradient>
        <radialGradient id="blackHead">
          <stop offset="0" stopColor="#2a2a2c" />
          <stop offset="1" stopColor="#141415" />
        </radialGradient>
        {/* A clear head shows the inside of the shell, darker towards the middle. */}
        <radialGradient id="clearHead">
          <stop offset="0" stopColor="#000" stopOpacity="0.72" />
          <stop offset="0.85" stopColor="#000" stopOpacity="0.45" />
          <stop offset="1" stopColor="#000" stopOpacity="0.2" />
        </radialGradient>
      </defs>

      {/* Shell / hoop ring with tension lugs */}
      <circle r={R + hoop} fill={drum.shellColor} />
      <circle r={R + hoop} fill="none" stroke="var(--ios-separator)" strokeWidth={line} />
      {Array.from({ length: lugs }, (_, i) => (
        <rect
          key={i}
          x={-hoop * 0.22}
          y={-(R + hoop * 0.8)}
          width={hoop * 0.44}
          height={hoop * 0.6}
          rx={hoop * 0.12}
          fill="#d9dbde"
          stroke="rgb(0 0 0 / 0.25)"
          strokeWidth={line}
          transform={`rotate(${(i / lugs) * 360 + 180 / lugs})`}
        />
      ))}

      {/* Head */}
      {drum.finish === "clear" && <circle r={R} fill={drum.shellColor} />}
      <circle r={R} fill={headFill} stroke="rgb(0 0 0 / 0.3)" strokeWidth={line} />

      {/* Ruler + centre mark */}
      <path d={ticks} stroke={`rgb(${ink} / 0.22)`} strokeWidth={line} fill="none" />
      <path d={`M${-R} 0H${R}M0 ${-R}V${R}`} stroke={`rgb(${ink} / 0.08)`} strokeWidth={line} fill="none" />
      <circle r={4} fill="none" stroke={`rgb(${ink} / 0.35)`} strokeWidth={line} />

      {/* Cut area */}
      {drum.margin > 0 && (
        <circle
          r={usableR}
          fill="none"
          stroke={`rgb(${ink} / 0.4)`}
          strokeWidth={line}
          strokeDasharray={`${6 * line} ${4 * line}`}
        />
      )}
    </g>
  );
});

function SelectionBox({
  x,
  y,
  rotation,
  w,
  h,
  handle,
  arm,
}: {
  x: number;
  y: number;
  rotation: number;
  w: number;
  h: number;
  handle: number;
  arm: number;
}) {
  const corners: Pt[] = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ];
  const stroke = { stroke: "var(--ios-accent)", vectorEffect: "non-scaling-stroke" as const };
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotation})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="none" strokeWidth={1.5} pointerEvents="none" {...stroke} />
      <line x1={0} y1={-h / 2} x2={0} y2={-h / 2 - arm} strokeWidth={1.5} pointerEvents="none" {...stroke} />
      <Handle role="rotate" at={[0, -h / 2 - arm]} r={handle} className="cursor-grab" />
      {corners.map((c, i) => (
        <Handle key={i} role="scale" at={c} r={handle} className={i % 2 ? "cursor-nesw-resize" : "cursor-nwse-resize"} />
      ))}
    </g>
  );
}

function Handle({ role, at, r, className }: { role: string; at: Pt; r: number; className: string }) {
  return (
    <g data-role={role} className={className}>
      {/* 44pt invisible hit area around a smaller visible dot. */}
      <circle cx={at[0]} cy={at[1]} r={r * 2} fill="transparent" />
      <circle
        cx={at[0]}
        cy={at[1]}
        r={r * 0.62}
        fill="#fff"
        stroke="var(--ios-accent)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        style={{ filter: "drop-shadow(0 1px 2px rgb(0 0 0 / 0.3))" }}
      />
    </g>
  );
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const angleDeg = (a: Pt, b: Pt) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;

function normalizeAngle(a: number) {
  return ((((a + 180) % 360) + 360) % 360) - 180;
}

/** Snap to the nearest 15° when within `within` degrees of it. */
function snapAngle(a: number, within: number) {
  const nearest = Math.round(a / 15) * 15;
  return Math.abs(a - nearest) < within ? normalizeAngle(nearest) : a;
}
