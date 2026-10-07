import type { Placement, Rings } from "./lib/geometry";
import type { RGB } from "./lib/outline";

export const MM_PER_INCH = 25.4;
export const DRUM_PRESETS_IN = [8, 10, 12, 13, 14, 16, 18, 20, 22, 24, 26];

export type HeadFinish = "coated" | "clear" | "black";

export interface Drum {
  /** Head diameter in mm. */
  diameter: number;
  finish: HeadFinish;
  shellColor: string;
  /** Distance kept clear of the head edge, in mm. */
  margin: number;
  includeOutline: boolean;
}

export interface Sticker {
  name: string;
  /** The original file, printed untouched. */
  image: Blob;
  imageWidth: number;
  imageHeight: number;

  /** Traced edge of the image, in image pixels centred on the image. */
  outline: Rings;
  /** Whether the image has transparency; if not, the background colour is removed instead. */
  hasAlpha: boolean;
  removeBackground: boolean;
  background: RGB;
  tolerance: number;
  processing: boolean;
  error: string | null;

  /** Border around the image, in mm. */
  border: number;
  /** Fill enclosed gaps (e.g. the middle of a ring) instead of cutting them out. */
  fillGaps: boolean;

  /** Image centre relative to the head centre, in mm (y down). */
  x: number;
  y: number;
  /** Image width in mm; height follows the aspect ratio. */
  width: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
}

export interface State {
  drum: Drum;
  sticker: Sticker | null;
  selected: boolean;
}

export const SHELL_COLORS = [
  { name: "Piano Black", hex: "#16161a" },
  { name: "Arctic White", hex: "#ececec" },
  { name: "Natural Maple", hex: "#c99a63" },
  { name: "Walnut", hex: "#6b4429" },
  { name: "Cherry Red", hex: "#8e1b1f" },
  { name: "Ocean Blue", hex: "#1d4f8c" },
  { name: "Emerald", hex: "#1b6b4a" },
  { name: "Silver Sparkle", hex: "#b8bcc2" },
];

export const initialState: State = {
  drum: {
    diameter: 22 * MM_PER_INCH,
    finish: "coated",
    shellColor: SHELL_COLORS[0].hex,
    margin: 10,
    includeOutline: true,
  },
  sticker: null,
  selected: false,
};

export const heightOf = (s: Sticker) => (s.width * s.imageHeight) / s.imageWidth;

export function placementOf(s: Sticker): Placement {
  return {
    x: s.x,
    y: s.y,
    scale: s.width / s.imageWidth,
    rotation: s.rotation,
    flipX: s.flipX,
    flipY: s.flipY,
  };
}

export type Action =
  | { type: "load"; state: State }
  | { type: "setDrum"; patch: Partial<Drum> }
  | { type: "setSticker"; sticker: Sticker | null }
  | { type: "update"; patch: Partial<Sticker> }
  | { type: "select"; selected: boolean };

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "load":
      return action.state;
    case "setDrum":
      return { ...state, drum: { ...state.drum, ...action.patch } };
    case "setSticker":
      return { ...state, sticker: action.sticker, selected: !!action.sticker };
    case "update":
      return state.sticker ? { ...state, sticker: { ...state.sticker, ...action.patch } } : state;
    case "select":
      return { ...state, selected: action.selected && !!state.sticker };
  }
}
