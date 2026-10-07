# Drum Vinyl

A web app for designing a **print-and-cut vinyl sticker for a drum head**. The user uploads one PNG/JPEG. The app keeps the image untouched, traces its edge, and adds an adjustable border to make the cut line. It previews the sticker on a drum head and exports two aligned files: a DXF cut line and a PNG print file.

Stack: Vite + React 19 + TypeScript + Tailwind v4. Runtime deps are `clipper-lib`, `idb-keyval` and `lucide-react`. Nothing else is needed.

## Working with the user

- **Default is teach, don't do.** The user is learning React/Vite. Explain the cause and the fix and let them write it, unless they explicitly ask for a specific change or a build. For big builds they chose "build it, explain as I go".
- They like being asked clarifying questions before big features (they asked for "lots of questions" at the start).
- **The design is approved; keep it.** It's iOS-first and follows Apple HIG for spacing, type and controls. Dark mode is automatic.
- They want lean code. When the goal changed they asked to remove everything that didn't serve it. Don't add speculative features.
- For a boolean option they asked for a checkbox, not an alert. Prefer inline controls over modal prompts.

## Requirements (as agreed)

- **One image per head.** PNG/JPEG/WebP. No SVG input and no multiple layers; both were removed on purpose.
- **Image is printed exactly as uploaded.** Never vectorise or recolour it.
- **Edge detection:**
  - PNGs: transparency.
  - Opaque images (JPEG): the background colour is auto-detected from the corners and removed, with a tolerance slider. This affects only the trace, never the print.
- **Cut line:** smooth rounded offset, with an adjustable border (default 3 mm, range 0–20).
- **Fill Enclosed Gaps:** a checkbox (default on) showing "N found". Unticked, holes like the middle of a ring are cut out.
- **Clipping:** the cut line is clipped to an adjustable edge margin (default 10 mm) inside the head.
- **Drum:** size presets 8–26″ plus a custom diameter in mm. Head finish (coated/clear/black) and shell colour are preview only.
- **Interaction:** drag, pinch to scale, twist to rotate (snaps to 15°), corner and rotate handles, centre-snap guides, flip H/V. Arrow keys nudge (Shift = 10 mm).
- **Export:**
  - **DXF:** R12, millimetres, layer `CUT`, plus an optional `HEAD_OUTLINE` circle.
  - **PNG:** the whole head at the same scale, with DPI written into a `pHYs` chunk.
  - Both files share one frame: head bounding square, origin at the bottom-left.
- **Autosave:** state, including the image Blob, goes to IndexedDB under key `drum-vinyl:v2`.

## Architecture

```
src/
  model.ts            State (Drum + one Sticker), reducer, constants (presets, shell colours)
  App.tsx             Owns state, autosave, file import, (re)tracing, cut memo, layout
  lib/outline.ts      Image → "ink" field (alpha × background distance) → marching squares → rings in image px
  lib/cut.ts          computeCut (border offset + smoothing + gaps), planCut (place in mm + clip), renderPrintPng (+ pHYs)
  lib/geometry.ts     Clipper wrappers (normalize, intersection, offset), placeRings, ring helpers
  lib/dxf.ts          Hand-written R12 DXF writer
  components/DrumCanvas.tsx   SVG canvas in mm units; pointer-event gestures; drum head drawing
  components/Inspector.tsx    "Sticker" and "Drum" tabs
  components/ExportSheet.tsx  Bottom sheet; pre-renders files; share/download
  components/ui.tsx           HIG controls: Section, Row, SliderRow, NumberField, Switch(Row), CheckboxRow, Segmented, Button, ColorSwatches
  index.css                   iOS system colour tokens (light/dark) → Tailwind theme; slider styling
```

**Data flow.**
1. The `outline` is traced once per image or background setting, in **image pixels centred on the image**.
2. `computeCut` turns it into cut rings in the same pixel space. It's memoised and keyed on a deferred width.
3. `planCut` places those rings on the head in **mm (head centre origin, y down)** and clips them to the margin.
4. The preview draws `plan.rings`, so the preview cut line is exactly what gets exported.

**Coordinate spaces.**
- The canvas SVG viewBox is in mm.
- The DXF flips y and moves the origin to the bottom-left: `(x + r, r − y)`.
- The print PNG maps mm to pixels with `ctx.setTransform(pxPerMm, …, size/2, size/2)`.

## Non-obvious decisions and gotchas

- **Clipper uses integers.** `geometry.ts` multiplies coordinates by `SCALE = 100`. Outer rings have positive `signedArea`, holes negative.
- **Smoothing the cut line.** `computeCut` offsets out by `border + 1 mm`, then back in by `1 mm`. That closing step rounds concave corners. It also drops islands under 4 mm² and gaps under 9 mm².
- **Tracer settings.** The tracer uses the anti-aliased alpha field with `INK_THRESHOLD = 0.2` and no blur. An earlier 3×3 blur erased lines under 2 px, so don't reintroduce it.
- **iOS Safari limits:**
  - Canvas is capped at about 16.7 MP, so the print PNG is at most 4096 px.
  - `navigator.share` and downloads must happen right after a tap. `ExportSheet` therefore renders the PNG as soon as it opens, not on button press.
  - `crypto.randomUUID` needs HTTPS. There are no ids now, but avoid it if they come back.
- **A `FileList` is live.** Resetting the `<input>` empties it, so copy the files before any `await`.
- **Lint rules.** The ESLint React Compiler rules reject `useCallback`/`useMemo` with "inaccurate" deps. Pull values into locals first, then memoise on those.
- **Lucide's flip icon names are the opposite of the labels.** `FlipVertical2` is used for "Flip H".

## Testing approach

There's no test suite. Verification was manual plus scripted:

- `npx tsc -b && npm run lint && npm run build` must be clean.
- **End-to-end.** Playwright WebKit with `devices["iPhone 15"]`. Install it in the session scratchpad, not the repo.
  - Upload generated test images: a transparent ring PNG with an outer edge at r = 190 px and inner at r = 150 px, and a JPEG on white.
  - Check the cut radii in the exported DXF with `dxf-parser`. At default width on a 22″ head: outer ≈ 135.7 mm, inner ≈ 101.8 mm with a 3 mm border.
  - Check the PNG's size and `pHYs` chunk.
  - Pinch can be simulated by dispatching two touch `PointerEvent`s on `svg[role=img]`.

## Deployment status

- **Repo:** `github.com/Moolteepass/drum-vinyl`, branch `main`. The user pushes straight to `main`.
- **GitHub Pages:** `.github/workflows/deploy.yml` builds and deploys on push. `vite.config.ts` uses `base: "./"`.
- **Pending user action (as of 2026-10-07):**
  - The repo looked private (the API returned 404), so it needs to be public or on a paid plan.
  - The user needs to set Settings → Pages → Source to **GitHub Actions**, then re-run the workflow.
  - **Expected URL:** https://moolteepass.github.io/drum-vinyl/
  - Next session: confirm it's live before doing anything else deploy-related.

## Possible next steps

These are ideas, not commitments. Ask before building any of them.

- Do a real test cut: import both files into the user's cutter software and confirm a 22″ head measures 558.8 mm and the PNG aligns.
- Registration marks for printers that need them, e.g. Silhouette/Cricut print-then-cut. Not requested yet.
- Higher print DPI for large heads, e.g. export only the sticker's bounding box with an offset. This would break the "same frame" simplicity.
- PWA manifest and icon so "Add to Home Screen" gets a proper icon.
