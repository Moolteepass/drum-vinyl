import type { Rings } from "./geometry";

export interface DxfLayer {
  name: string;
  /** AutoCAD Colour Index used to display the layer (1 red, 5 blue, 7 white/black…). */
  aci: number;
  rings: Rings;
}

export interface DxfInput {
  /** Drum head diameter in mm. */
  diameter: number;
  layers: DxfLayer[];
  /** Adds a circle at the exact head diameter on its own layer. */
  includeOutline: boolean;
}

export const OUTLINE_LAYER = "HEAD_OUTLINE";

/**
 * Write an AutoCAD R12 DXF in millimetres.
 *
 * Coordinates arrive centred on the drum head with y pointing down (screen
 * space). DXF has y pointing up, and cutters prefer positive coordinates, so
 * the head centre moves to (r, r) and y is flipped.
 */
export function writeDxf({ diameter, layers, includeOutline }: DxfInput): string {
  const r = diameter / 2;
  const out: string[] = [];
  const pair = (code: number, value: string | number) => {
    out.push(String(code), typeof value === "number" ? fmt(value) : value);
  };
  const tx = (x: number) => x + r;
  const ty = (y: number) => r - y;

  const allLayers = [
    ...layers.map((l) => ({ name: l.name, aci: l.aci })),
    ...(includeOutline ? [{ name: OUTLINE_LAYER, aci: 1 }] : []),
  ];

  // HEADER: version, units (4 = millimetres) and drawing extents.
  pair(0, "SECTION");
  pair(2, "HEADER");
  pair(9, "$ACADVER");
  pair(1, "AC1009");
  pair(9, "$INSUNITS");
  out.push("70", "4");
  pair(9, "$MEASUREMENT");
  out.push("70", "1");
  pair(9, "$EXTMIN");
  pair(10, 0);
  pair(20, 0);
  pair(30, 0);
  pair(9, "$EXTMAX");
  pair(10, diameter);
  pair(20, diameter);
  pair(30, 0);
  pair(0, "ENDSEC");

  // TABLES: the CONTINUOUS line type and one entry per layer.
  pair(0, "SECTION");
  pair(2, "TABLES");
  pair(0, "TABLE");
  pair(2, "LTYPE");
  out.push("70", "1");
  pair(0, "LTYPE");
  pair(2, "CONTINUOUS");
  out.push("70", "0");
  pair(3, "Solid line");
  out.push("72", "65", "73", "0");
  pair(40, 0);
  pair(0, "ENDTAB");
  pair(0, "TABLE");
  pair(2, "LAYER");
  out.push("70", String(allLayers.length));
  for (const layer of allLayers) {
    pair(0, "LAYER");
    pair(2, layer.name);
    out.push("70", "0", "62", String(layer.aci));
    pair(6, "CONTINUOUS");
  }
  pair(0, "ENDTAB");
  pair(0, "ENDSEC");

  // ENTITIES: every ring becomes a closed POLYLINE.
  pair(0, "SECTION");
  pair(2, "ENTITIES");
  for (const layer of layers) {
    for (const ring of layer.rings) {
      pair(0, "POLYLINE");
      pair(8, layer.name);
      out.push("66", "1");
      pair(10, 0);
      pair(20, 0);
      pair(30, 0);
      out.push("70", "1"); // 1 = closed
      for (const [x, y] of ring) {
        pair(0, "VERTEX");
        pair(8, layer.name);
        pair(10, tx(x));
        pair(20, ty(y));
        pair(30, 0);
      }
      pair(0, "SEQEND");
      pair(8, layer.name);
    }
  }
  if (includeOutline) {
    pair(0, "CIRCLE");
    pair(8, OUTLINE_LAYER);
    pair(10, r);
    pair(20, r);
    pair(30, 0);
    pair(40, r);
  }
  pair(0, "ENDSEC");
  pair(0, "EOF");

  return out.join("\n") + "\n";
}

function fmt(n: number): string {
  // 4 decimals = 0.1 µm, far beyond any cutter's resolution.
  return (Math.round(n * 10000) / 10000).toString();
}
