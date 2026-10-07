import type { Dispatch, ReactNode } from "react";
import { Crosshair, FlipHorizontal2, FlipVertical2, ImagePlus, LoaderCircle, Replace, TriangleAlert } from "lucide-react";
import { DRUM_PRESETS_IN, MM_PER_INCH, SHELL_COLORS, heightOf, type Action, type Drum, type HeadFinish, type State, type Sticker } from "../model";
import { CheckboxRow, ColorSwatches, NumberField, Row, Section, Segmented, SliderRow, SwitchRow } from "./ui";

export type Tab = "sticker" | "drum";

interface Props {
  state: State;
  dispatch: Dispatch<Action>;
  tab: Tab;
  onTab: (t: Tab) => void;
  imageUrl: string | null;
  gapCount: number;
  onAdd: () => void;
  /** Re-trace the outline after the background settings change. */
  onRetrace: (patch: Partial<Sticker>) => void;
}

export function Inspector({ state, dispatch, tab, onTab, imageUrl, gapCount, onAdd, onRetrace }: Props) {
  return (
    <>
      <div className="shrink-0 px-4 pt-2 pb-3">
        <Segmented<Tab>
          label="Inspector"
          value={tab}
          onChange={onTab}
          options={[
            { value: "sticker", label: "Sticker" },
            { value: "drum", label: "Drum" },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-1 pb-[max(24px,env(safe-area-inset-bottom))]">
        {tab === "sticker" &&
          (state.sticker ? (
            <StickerPanel
              sticker={state.sticker}
              drum={state.drum}
              imageUrl={imageUrl}
              gapCount={gapCount}
              dispatch={dispatch}
              onReplace={onAdd}
              onRetrace={onRetrace}
            />
          ) : (
            <EmptySticker onAdd={onAdd} />
          ))}
        {tab === "drum" && <DrumPanel drum={state.drum} dispatch={dispatch} />}
      </div>
    </>
  );
}

function EmptySticker({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-4 grid size-16 place-items-center rounded-[18px] bg-accent/12 text-accent">
        <ImagePlus className="size-8" strokeWidth={1.75} />
      </div>
      <h2 className="text-[20px] leading-[25px] font-semibold tracking-[0.38px]">Add an Image</h2>
      <p className="mt-1.5 mb-5 text-[15px] leading-5 tracking-[-0.24px] text-label-2">
        A PNG with a transparent background gives the cleanest cut line. JPEGs work too.
      </p>
      <button
        onClick={onAdd}
        className="h-[50px] rounded-[14px] bg-accent px-6 text-[17px] font-semibold text-white active:opacity-80"
      >
        Choose Image
      </button>
    </div>
  );
}

function StickerPanel({
  sticker: s,
  drum,
  imageUrl,
  gapCount,
  dispatch,
  onReplace,
  onRetrace,
}: {
  sticker: Sticker;
  drum: Drum;
  imageUrl: string | null;
  gapCount: number;
  dispatch: Dispatch<Action>;
  onReplace: () => void;
  onRetrace: (patch: Partial<Sticker>) => void;
}) {
  const set = (patch: Partial<Sticker>) => dispatch({ type: "update", patch });
  const R = drum.diameter / 2;
  const [r, g, b] = s.background;

  return (
    <>
      <Section>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-cell-2">
            {imageUrl && <img src={imageUrl} alt="" className="size-full object-contain" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-semibold">{s.name}</p>
            <p className="flex items-center gap-1.5 text-[13px] text-label-2">
              {s.processing ? (
                <>
                  <LoaderCircle className="size-3.5 animate-spin" /> Tracing edge…
                </>
              ) : s.error ? (
                <span className="flex items-center gap-1 text-danger">
                  <TriangleAlert className="size-3.5" /> {s.error}
                </span>
              ) : (
                <span className="tabular-nums">
                  {s.imageWidth} × {s.imageHeight} px · {Math.round((s.imageWidth / s.width) * MM_PER_INCH)} dpi
                </span>
              )}
            </p>
          </div>
        </div>
      </Section>

      <Section>
        <div className="grid grid-cols-4 gap-px bg-separator/40">
          <Tile icon={<Crosshair />} label="Centre" onClick={() => set({ x: 0, y: 0 })} />
          <Tile icon={<FlipVertical2 />} label="Flip H" active={s.flipX} onClick={() => set({ flipX: !s.flipX })} />
          <Tile icon={<FlipHorizontal2 />} label="Flip V" active={s.flipY} onClick={() => set({ flipY: !s.flipY })} />
          <Tile icon={<Replace />} label="Replace" onClick={onReplace} />
        </div>
      </Section>

      <Section header="Cut Line" footer="The blade follows the image's edge, this far out. Untick Fill Enclosed Gaps to cut out holes like the middle of a ring, so the drum head shows through.">
        <SliderRow
          label="Border"
          unit="mm"
          decimals={1}
          min={0}
          max={20}
          step={0.5}
          value={s.border}
          onChange={(border) => set({ border: Math.max(0, border) })}
        />
        <CheckboxRow
          label="Fill Enclosed Gaps"
          detail={gapCount ? `${gapCount} found` : "None found"}
          checked={s.fillGaps ?? true}
          disabled={gapCount === 0}
          onChange={(fillGaps) => set({ fillGaps })}
        />
      </Section>

      <Section header="Size & Position">
        <SliderRow
          label="Width"
          unit="mm"
          decimals={1}
          min={MIN_WIDTH}
          max={Math.round(drum.diameter)}
          step={0.5}
          value={s.width}
          onChange={(width) => set({ width: Math.max(MIN_WIDTH, width) })}
        />
        <Row label="Height">
          <span className="text-label-2 tabular-nums">{heightOf(s).toFixed(1)} mm</span>
        </Row>
        <SliderRow label="Rotation" unit="°" min={-180} max={180} value={s.rotation} onChange={(rotation) => set({ rotation })} />
        <SliderRow
          label="Horizontal"
          unit="mm"
          decimals={1}
          min={-Math.round(R)}
          max={Math.round(R)}
          step={0.5}
          value={s.x}
          onChange={(x) => set({ x })}
        />
        <SliderRow
          label="Vertical"
          unit="mm"
          decimals={1}
          min={-Math.round(R)}
          max={Math.round(R)}
          step={0.5}
          value={s.y}
          onChange={(y) => set({ y })}
        />
      </Section>

      <Section
        header="Edge Detection"
        footer={
          s.hasAlpha
            ? "Traced around the image's transparent areas."
            : "This image has no transparency, so pixels close to the background colour are treated as empty when tracing. The print file keeps the image exactly as it is."
        }
      >
        <SwitchRow
          label="Remove Background"
          checked={s.removeBackground}
          onChange={(removeBackground) => onRetrace({ removeBackground })}
        />
        {s.removeBackground && (
          <>
            <Row label="Background">
              <span className="font-mono text-[15px] text-label-2 uppercase">
                #{[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}
              </span>
              <span
                className="size-6 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)]"
                style={{ background: `rgb(${r} ${g} ${b})` }}
              />
            </Row>
            <SliderRow
              label="Tolerance"
              min={0}
              max={150}
              value={s.tolerance}
              onChange={(tolerance) => onRetrace({ tolerance })}
            />
          </>
        )}
      </Section>

      <Section>
        <Row onClick={() => dispatch({ type: "setSticker", sticker: null })}>
          <span className="flex-1 text-center text-danger">Remove Image</span>
        </Row>
      </Section>
    </>
  );
}

const MIN_WIDTH = 5;

function Tile({ icon, label, onClick, active = false }: { icon: ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium tracking-[0.06px] active:bg-fill [&_svg]:size-[22px] [&_svg]:stroke-[1.75] ${
        active ? "bg-accent/12 text-accent" : "bg-cell text-label"
      }`}
    >
      <span className="text-accent">{icon}</span>
      {label}
    </button>
  );
}

function DrumPanel({ drum, dispatch }: { drum: Drum; dispatch: Dispatch<Action> }) {
  const set = (patch: Partial<Drum>) => dispatch({ type: "setDrum", patch });
  const inches = drum.diameter / MM_PER_INCH;
  return (
    <>
      <Section header="Head Size" footer="Choose the nominal head size, or type an exact diameter in millimetres.">
        <div className="grid grid-cols-4 gap-2 p-3 sm:grid-cols-6 md:grid-cols-4">
          {DRUM_PRESETS_IN.map((size) => {
            const active = Math.abs(inches - size) < 0.01;
            return (
              <button
                key={size}
                onClick={() => set({ diameter: size * MM_PER_INCH })}
                aria-pressed={active}
                className={`h-11 rounded-[10px] text-[15px] font-semibold tabular-nums transition-colors ${
                  active ? "bg-accent text-white" : "bg-fill text-label active:bg-fill-2"
                }`}
              >
                {size}″
              </button>
            );
          })}
        </div>
        <Row label="Diameter">
          <NumberField
            label="Diameter"
            unit="mm"
            decimals={1}
            value={drum.diameter}
            onChange={(v) => set({ diameter: Math.min(Math.max(v, 100), 1000) })}
          />
        </Row>
      </Section>

      <Section
        header="Cut Area"
        footer={`Nothing is cut within ${drum.margin} mm of the edge, so the hoop doesn't cover the vinyl. Usable diameter: ${(drum.diameter - drum.margin * 2).toFixed(1)} mm.`}
      >
        <SliderRow label="Edge Margin" unit="mm" min={0} max={60} value={drum.margin} onChange={(margin) => set({ margin })} />
      </Section>

      <Section header="Head Finish">
        <div className="p-3">
          <Segmented<HeadFinish>
            label="Head finish"
            value={drum.finish}
            onChange={(finish) => set({ finish })}
            options={[
              { value: "coated", label: "Coated" },
              { value: "clear", label: "Clear" },
              { value: "black", label: "Black" },
            ]}
          />
        </div>
      </Section>

      <Section header="Shell Colour">
        <ColorSwatches colors={SHELL_COLORS} value={drum.shellColor} onChange={(shellColor) => set({ shellColor })} />
      </Section>

      <Section header="Export" footer="Adds a circle at the full head diameter on its own HEAD_OUTLINE layer, for alignment.">
        <SwitchRow label="Include Head Outline" checked={drum.includeOutline} onChange={(includeOutline) => set({ includeOutline })} />
      </Section>
    </>
  );
}
