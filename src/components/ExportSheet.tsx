import { useEffect, useMemo, useState, type Dispatch } from "react";
import { Download, LoaderCircle, Share, TriangleAlert } from "lucide-react";
import { renderPrintPng, type CutPlan } from "../lib/cut";
import { writeDxf } from "../lib/dxf";
import { loadImage } from "../lib/outline";
import { MM_PER_INCH, type Action, type State } from "../model";
import { Button, Row, Section, SwitchRow } from "./ui";

export function ExportSheet({
  state,
  plan,
  imageUrl,
  dispatch,
  onClose,
}: {
  state: State;
  plan: CutPlan;
  imageUrl: string;
  dispatch: Dispatch<Action>;
  onClose: () => void;
}) {
  const { drum, sticker } = state;
  const inches = +(drum.diameter / MM_PER_INCH).toFixed(1);
  const base = `drum-${inches}in`;
  const canShare = typeof navigator.canShare === "function";
  const empty = plan.rings.length === 0;
  const [png, setPng] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dxf = useMemo(
    () =>
      new File(
        [writeDxf({ diameter: drum.diameter, layers: [{ name: "CUT", aci: 6, rings: plan.rings }], includeOutline: drum.includeOutline })],
        `${base}-cut.dxf`,
        { type: "application/dxf" },
      ),
    [drum, plan, base],
  );

  // Render the print file up front: Safari only allows sharing/downloading right
  // after a tap, and a big PNG can take longer than that to render.
  useEffect(() => {
    if (!sticker || empty) return;
    let cancelled = false;
    loadImage(imageUrl)
      .then((img) => renderPrintPng(img, sticker, plan, drum))
      .then(({ blob }) => !cancelled && setPng(new File([blob], `${base}-print.png`, { type: "image/png" })))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [sticker, plan, drum, imageUrl, base, empty]);

  const shareBoth = async () => {
    if (!png) return;
    const files = [dxf, png];
    try {
      if (navigator.canShare({ files })) await navigator.share({ files });
      else files.forEach(download);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError((err as Error).message);
    }
  };
  const busy = !png && !error && !empty;

  const printSize = Math.min(4096, Math.round(inches * 300));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal aria-labelledby="export-title">
      <div className="absolute inset-0 animate-[fade-in_.25s_ease-out] bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full animate-[sheet-up_.35s_cubic-bezier(.2,.9,.3,1)] flex-col overflow-hidden rounded-t-[14px] bg-grouped md:max-w-[440px] md:animate-[fade-in_.2s_ease-out] md:rounded-[14px] md:shadow-2xl">
        <div className="mx-auto mt-[5px] h-[5px] w-9 rounded-full bg-label-3 md:hidden" />
        <header className="grid grid-cols-[1fr_auto_1fr] items-center px-4 pt-2 pb-3">
          <button onClick={onClose} className="justify-self-start text-[17px] text-accent active:opacity-50">
            Cancel
          </button>
          <h2 id="export-title" className="text-[17px] font-semibold">
            Export
          </h2>
          <span />
        </header>

        <div className="overflow-y-auto px-4 pb-4">
          <Section
            header="Files"
            footer="Both files cover the whole head at the same scale. Place them at the same position in your cutter software and they line up exactly."
          >
            <Row label={<span className="font-mono text-[15px]">{base}-cut.dxf</span>}>
              <span className="text-[15px] text-label-2">Cut line · mm</span>
            </Row>
            <Row label={<span className="font-mono text-[15px]">{base}-print.png</span>}>
              <span className="text-[15px] text-label-2 tabular-nums">
                {printSize} px · {Math.round(printSize / inches)} dpi
              </span>
            </Row>
          </Section>

          <Section header="Summary">
            <Row label="Head">
              <span className="text-label-2 tabular-nums">
                {inches}″ · {drum.diameter.toFixed(1)} mm
              </span>
            </Row>
            <Row label="Cut Paths">
              <span className="text-label-2 tabular-nums">{plan.rings.length}</span>
            </Row>
          </Section>

          {plan.trimmed && (
            <div className="mb-8 flex gap-3 rounded-[10px] bg-[#ff9f0a]/15 px-4 py-3 text-[15px] leading-5">
              <TriangleAlert className="mt-px size-5 shrink-0 text-[#ff9f0a]" />
              <span>Part of the sticker extends past the edge margin. The cut line follows the margin there.</span>
            </div>
          )}

          {error && (
            <div className="mb-8 flex gap-3 rounded-[10px] bg-danger/15 px-4 py-3 text-[15px] leading-5">
              <TriangleAlert className="mt-px size-5 shrink-0 text-danger" />
              <span>{error}</span>
            </div>
          )}

          <Section>
            <SwitchRow
              label="Include Head Outline"
              checked={drum.includeOutline}
              onChange={(includeOutline) => dispatch({ type: "setDrum", patch: { includeOutline } })}
            />
          </Section>
        </div>

        <footer className="flex flex-col gap-2 border-t border-separator/50 bg-grouped px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
          {canShare && (
            <Button size="lg" onClick={shareBoth} disabled={!png}>
              {busy ? <LoaderCircle className="size-5 animate-spin" /> : <Share className="size-5" />} Share Both Files…
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" variant={canShare ? "gray" : "filled"} onClick={() => download(dxf)} disabled={empty}>
              <Download className="size-5" /> Cut DXF
            </Button>
            <Button size="lg" variant={canShare ? "gray" : "filled"} onClick={() => png && download(png)} disabled={!png}>
              {busy ? <LoaderCircle className="size-5 animate-spin" /> : <Download className="size-5" />} Print PNG
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
