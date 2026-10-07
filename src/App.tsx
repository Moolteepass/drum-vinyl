import { useCallback, useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { get, set } from "idb-keyval";
import { ImagePlus, LoaderCircle } from "lucide-react";
import { DrumCanvas } from "./components/DrumCanvas";
import { ExportSheet } from "./components/ExportSheet";
import { Inspector, type Tab } from "./components/Inspector";
import { Button } from "./components/ui";
import { computeCut, planCut } from "./lib/cut";
import { analyzeImage, loadImage, traceOutline } from "./lib/outline";
import { MM_PER_INCH, initialState, reducer, type State, type Sticker } from "./model";

const STORAGE_KEY = "drum-vinyl:v2";
const DEFAULT_BORDER_MM = 3;
const DEFAULT_TOLERANCE = 40;

function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("sticker");
  const [exporting, setExporting] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const traceJob = useRef(0);
  const { sticker, drum } = state;

  // An object URL lets <img>/<image> show the stored file without copying it.
  const image = sticker?.image;
  const imageUrl = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(() => () => void (imageUrl && URL.revokeObjectURL(imageUrl)), [imageUrl]);

  /** Re-trace the edge (debounced) after the background settings change. */
  const retrace = useCallback(
    (base: Sticker, patch: Partial<Sticker>, delay = 200) => {
      const next = { ...base, ...patch };
      dispatch({ type: "update", patch: { ...patch, processing: true } });
      const job = ++traceJob.current;
      setTimeout(async () => {
        if (job !== traceJob.current) return; // superseded while debouncing
        const url = URL.createObjectURL(next.image);
        try {
          const outline = traceOutline(await loadImage(url), next);
          if (job === traceJob.current) {
            dispatch({
              type: "update",
              patch: {
                outline,
                processing: false,
                error: outline.length ? null : "No edge found. Try a lower tolerance.",
              },
            });
          }
        } catch (err) {
          dispatch({ type: "update", patch: { processing: false, error: (err as Error).message } });
        } finally {
          URL.revokeObjectURL(url);
        }
      }, delay);
    },
    [],
  );

  // Restore the last session.
  useEffect(() => {
    get<State>(STORAGE_KEY)
      .then((saved) => {
        if (!saved) return;
        dispatch({ type: "load", state: { ...saved, selected: false } });
        if (saved.sticker?.processing) retrace(saved.sticker, {}, 0);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [retrace]);

  // Autosave, debounced so dragging doesn't write on every frame.
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => set(STORAGE_KEY, state).catch(() => {}), 400);
    return () => clearTimeout(t);
  }, [state, loaded]);

  const addFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      alert("Please choose a PNG or JPEG image.");
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const info = analyzeImage(await loadImage(url));
      // Longest side starts at half the head diameter.
      const width = (info.width / Math.max(info.width, info.height)) * drum.diameter * 0.5;
      const next: Sticker = {
        name: file.name.replace(/\.[^.]+$/, "") || "Image",
        image: file,
        imageWidth: info.width,
        imageHeight: info.height,
        outline: [],
        hasAlpha: info.hasAlpha,
        removeBackground: !info.hasAlpha,
        background: info.background,
        tolerance: DEFAULT_TOLERANCE,
        processing: true,
        error: null,
        border: sticker?.border ?? DEFAULT_BORDER_MM,
        fillGaps: true,
        x: 0,
        y: 0,
        width,
        rotation: 0,
        flipX: false,
        flipY: false,
      };
      dispatch({ type: "setSticker", sticker: next });
      retrace(next, {}, 0);
      setTab("sticker");
      setPanelOpen(true);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  // Recomputing the border is the expensive part, so it waits out fast pinches.
  const width = useDeferredValue(sticker?.width ?? 0);
  const outline = sticker?.outline;
  const imageWidth = sticker?.imageWidth ?? 1;
  const border = sticker?.border ?? 0;
  const fillGaps = sticker?.fillGaps ?? true;
  const cut = useMemo(
    () => (outline ? computeCut(outline, width / imageWidth, border, fillGaps) : { rings: [], gapCount: 0 }),
    [outline, width, imageWidth, border, fillGaps],
  );
  const plan = useMemo(
    () => (sticker ? planCut(sticker, cut, drum) : { rings: [], trimmed: false }),
    [sticker, cut, drum],
  );

  // Desktop keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (exporting || (e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "Escape") dispatch({ type: "select", selected: false });
      if (!sticker) return;
      const step = e.shiftKey ? 10 : 1;
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (nudge[e.key]) {
        e.preventDefault();
        dispatch({ type: "update", patch: { x: sticker.x + nudge[e.key][0], y: sticker.y + nudge[e.key][1] } });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sticker, exporting]);

  const inches = drum.diameter / MM_PER_INCH;

  return (
    <div className="flex h-dvh flex-col bg-grouped md:flex-row">
      <main
        className="relative flex min-h-0 flex-1 flex-col bg-canvas"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFile(e.dataTransfer.files[0]);
        }}
      >
        {/* Navigation bar */}
        <header className="z-10 flex shrink-0 items-center gap-3 border-b border-separator/40 bg-material px-4 pt-[max(8px,env(safe-area-inset-top))] pr-[max(16px,env(safe-area-inset-right))] pb-2 pl-[max(16px,env(safe-area-inset-left))] backdrop-blur-xl backdrop-saturate-150">
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] leading-[22px] font-semibold">Drum Vinyl</h1>
            <p className="text-[13px] leading-[18px] text-label-2 tabular-nums">
              {Number.isInteger(+inches.toFixed(2)) ? inches.toFixed(0) : inches.toFixed(1)}″ head · Ø{" "}
              {drum.diameter.toFixed(1)} mm
            </p>
          </div>
          {sticker?.processing && <LoaderCircle aria-label="Tracing" className="size-5 animate-spin text-label-2" />}
          <Button
            size="sm"
            variant="tinted"
            onClick={() => fileInput.current?.click()}
            aria-label={sticker ? "Replace image" : "Add image"}
          >
            <ImagePlus className="size-[18px]" />
            <span className="hidden sm:inline">{sticker ? "Replace" : "Add"}</span>
          </Button>
          <Button size="sm" onClick={() => setExporting(true)} disabled={!plan.rings.length}>
            Export
          </Button>
        </header>

        <div className="relative min-h-0 flex-1 p-3 md:p-6">
          <DrumCanvas
            drum={drum}
            sticker={sticker}
            imageUrl={imageUrl}
            cutLocal={cut.rings}
            cutPlaced={plan.rings}
            selected={state.selected}
            dispatch={dispatch}
          />

          {loaded && !sticker && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <button
                onClick={() => fileInput.current?.click()}
                className="pointer-events-auto flex flex-col items-center gap-2 rounded-[20px] bg-material px-6 py-5 text-center shadow-[0_8px_30px_rgb(0_0_0/0.12)] backdrop-blur-xl transition-transform active:scale-[0.98]"
              >
                <ImagePlus className="size-8 text-accent" strokeWidth={1.75} />
                <span className="text-[17px] font-semibold">Add an Image</span>
                <span className="text-[13px] text-label-2">PNG or JPEG · or drop a file here</span>
              </button>
            </div>
          )}

          {dragOver && (
            <div className="pointer-events-none absolute inset-3 grid place-items-center rounded-[20px] border-2 border-dashed border-accent bg-accent/10 text-[17px] font-semibold text-accent">
              Drop to add
            </div>
          )}
        </div>
      </main>

      {/* Inspector: bottom panel on phones, sidebar on iPad/desktop */}
      <aside
        className={`flex shrink-0 flex-col border-t border-separator/40 bg-grouped transition-[height] duration-300 ease-out md:h-auto md:w-[380px] md:border-t-0 md:border-l md:pr-[env(safe-area-inset-right)] ${
          panelOpen ? "h-[48dvh]" : "h-[calc(64px+env(safe-area-inset-bottom))]"
        }`}
      >
        <button
          aria-label={panelOpen ? "Collapse panel" : "Expand panel"}
          onClick={() => setPanelOpen((o) => !o)}
          className="flex h-4 shrink-0 items-center justify-center md:hidden"
        >
          <span className="h-[5px] w-9 rounded-full bg-label-3" />
        </button>
        <div className="flex min-h-0 flex-1 flex-col md:pt-[max(12px,env(safe-area-inset-top))]">
          <Inspector
            state={state}
            dispatch={dispatch}
            tab={tab}
            onTab={(t) => {
              setTab(t);
              setPanelOpen(true);
            }}
            imageUrl={imageUrl}
            gapCount={cut.gapCount}
            onAdd={() => fileInput.current?.click()}
            onRetrace={(patch) => sticker && retrace(sticker, patch)}
          />
        </div>
      </aside>

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          addFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {exporting && sticker && imageUrl && (
        <ExportSheet state={state} plan={plan} imageUrl={imageUrl} dispatch={dispatch} onClose={() => setExporting(false)} />
      )}
    </div>
  );
}

export default App;
