import { useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { Check } from "lucide-react";

/** An inset grouped list section, like iOS Settings. */
export function Section({
  header,
  footer,
  children,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-8 last:mb-0">
      {header && (
        <h3 className="px-4 pb-1.5 text-[13px] leading-[18px] font-normal tracking-[-0.08px] text-label-2 uppercase">
          {header}
        </h3>
      )}
      <div className="overflow-hidden rounded-[10px] bg-cell">{children}</div>
      {footer && (
        <p className="px-4 pt-1.5 text-[13px] leading-[18px] tracking-[-0.08px] text-label-2">
          {footer}
        </p>
      )}
    </section>
  );
}

/** One row in a Section, at least 44pt tall. */
export function Row({
  label,
  children,
  onClick,
  className = "",
}: {
  label?: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`ios-row relative flex min-h-11 w-full items-center gap-3 px-4 py-[11px] text-left ${
        onClick ? "active:bg-fill" : ""
      } ${className}`}
    >
      {label !== undefined && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {children}
    </Tag>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const pct = ((Math.min(Math.max(value, min), max) - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      aria-label={label}
      className="ios-slider"
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ "--pct": `${pct}%` } as CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

/**
 * A titled slider with an editable value field, e.g. "Width   120 mm".
 * The number is typed in a text field so precise values are easy on a keyboard.
 */
export function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  decimals = 0,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  decimals?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="ios-row relative px-4 pt-[11px] pb-2">
      <div className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <NumberField value={value} decimals={decimals} unit={unit} label={label} onChange={onChange} />
      </div>
      <Slider label={label} value={value} min={min} max={max} step={step} onChange={onChange} />
    </div>
  );
}

/** Edits a number but only commits on blur/Enter, so typing "1" on the way to "120" isn't applied. */
export function NumberField({
  value,
  decimals = 0,
  unit,
  label,
  onChange,
}: {
  value: number;
  decimals?: number;
  unit?: string;
  label: string;
  onChange: (v: number) => void;
}) {
  const formatted = value.toFixed(decimals);
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft !== null) {
      const n = parseFloat(draft);
      if (Number.isFinite(n)) onChange(n);
    }
    setDraft(null);
  };

  return (
    <label className="flex items-baseline gap-1 text-label-2">
      <input
        aria-label={label}
        type="text"
        inputMode="decimal"
        // 17px keeps iOS Safari from zooming in when the field is focused.
        className="w-20 rounded-md bg-transparent px-1 text-right text-[17px] text-label-2 tabular-nums outline-none focus:bg-fill focus:text-label"
        value={draft ?? formatted}
        onFocus={(e) => {
          setDraft(formatted);
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(null);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {unit && <span className="text-[15px]">{unit}</span>}
    </label>
  );
}

/** UISwitch: 51 × 31pt, green when on. */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ${
        checked ? "bg-success" : "bg-fill-2"
      }`}
    >
      <span
        className={`absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgb(0_0_0/0.15),0_3px_1px_rgb(0_0_0/0.06)] transition-transform duration-200 ease-[cubic-bezier(.3,.7,.4,1.2)] ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

export function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Row label={label} className="py-1.5">
      <Switch label={label} checked={checked} onChange={onChange} />
    </Row>
  );
}

/** UISegmentedControl with a sliding thumb. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const index = options.findIndex((o) => o.value === value);
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="relative grid h-8 rounded-[9px] bg-fill p-[2px]"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {index >= 0 && (
        <span
          aria-hidden
          className="absolute top-[2px] bottom-[2px] left-[2px] rounded-[7px] bg-thumb shadow-[0_3px_8px_rgb(0_0_0/0.12),0_3px_1px_rgb(0_0_0/0.04)] transition-transform duration-250 ease-out"
          style={{
            width: `calc((100% - 4px) / ${options.length})`,
            transform: `translateX(${index * 100}%)`,
          }}
        />
      )}
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`relative z-10 flex min-w-0 items-center justify-center truncate px-2 text-[13px] leading-none tracking-[-0.08px] ${
            o.value === value ? "font-semibold" : "font-medium"
          } ${
            // Hide the divider next to the selected segment, as iOS does.
            i > 0 && i !== index && i - 1 !== index
              ? "before:absolute before:top-1.5 before:bottom-1.5 before:left-0 before:w-px before:bg-separator"
              : ""
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

type ButtonVariant = "filled" | "tinted" | "gray" | "plain" | "destructive";

export function Button({
  variant = "filled",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
}) {
  const variants: Record<ButtonVariant, string> = {
    filled: "bg-accent text-white active:opacity-80",
    tinted: "bg-accent/15 text-accent active:bg-accent/25",
    gray: "bg-fill text-accent active:bg-fill-2",
    plain: "text-accent active:opacity-50",
    destructive: "bg-danger/15 text-danger active:bg-danger/25",
  };
  const sizes = {
    sm: "h-[30px] px-3 text-[15px] rounded-full",
    md: "h-11 px-4 text-[17px] rounded-xl",
    lg: "h-[50px] px-5 text-[17px] rounded-[14px]",
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 font-semibold tracking-[-0.41px] transition-[opacity,background-color] select-none disabled:pointer-events-none disabled:opacity-40 ${variants[variant]} ${sizes[size]} ${className}`}
    />
  );
}

/** A wrapping grid of colour dots, with an optional custom colour well. */
export function ColorSwatches({
  colors,
  value,
  onChange,
  allowCustom = true,
}: {
  colors: { name: string; hex: string }[];
  value: string;
  onChange: (hex: string) => void;
  allowCustom?: boolean;
}) {
  const isCustom = !colors.some((c) => c.hex === value.toLowerCase());
  const custom = isCustom ? value : "#7f7f7f";

  const swatch = (selected: boolean) =>
    `relative grid size-11 place-items-center rounded-full ${selected ? "ring-[2.5px] ring-accent ring-offset-2 ring-offset-cell" : ""}`;

  return (
    <div className="grid grid-cols-[repeat(auto-fill,44px)] justify-between gap-x-2 gap-y-3 px-4 py-3">
      {colors.map((c) => (
        <button
          key={c.hex}
          title={c.name}
          aria-label={c.name}
          aria-pressed={c.hex === value.toLowerCase()}
          onClick={() => onChange(c.hex)}
          className={swatch(c.hex === value.toLowerCase())}
        >
          <span
            className="size-full rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]"
            style={{ background: c.hex }}
          />
          {c.hex === value.toLowerCase() && (
            <Check
              aria-hidden
              strokeWidth={3}
              className="absolute size-4"
              style={{ color: luminance(c.hex) > 0.6 ? "#000" : "#fff" }}
            />
          )}
        </button>
      ))}
      {allowCustom && (
        <label className={swatch(isCustom)} title="Custom colour">
          <span
            className="size-full rounded-full"
            style={{
              background: isCustom
                ? custom
                : "conic-gradient(from 90deg, #f44, #fd4, #4d4, #4ef, #44f, #f4f, #f44)",
            }}
          />
          <input
            type="color"
            aria-label="Custom colour"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={custom}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      )}
    </div>
  );
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

/** A checkbox row: the whole row toggles a round check, like iOS Reminders. */
export function CheckboxRow({
  label,
  detail,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  detail?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="ios-row relative flex min-h-11 w-full items-center gap-3 px-4 py-[11px] text-left active:bg-fill disabled:opacity-40"
    >
      <span
        aria-hidden
        className={`grid size-[22px] shrink-0 place-items-center rounded-full transition-colors duration-150 ${
          checked ? "bg-accent text-white" : "shadow-[inset_0_0_0_1.5px_var(--ios-label-3)]"
        }`}
      >
        {checked && <Check className="size-3.5" strokeWidth={3.5} />}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail && <span className="text-label-2 tabular-nums">{detail}</span>}
    </button>
  );
}
