# Drum Vinyl

Design a print-and-cut vinyl sticker for a drum head.

1. Pick the drum head size.
2. Add a PNG or JPEG. A cut line is traced around its edge, with an adjustable border.
3. Drag, pinch and twist to place it on the head.
4. Export a **DXF** cut line and a **PNG** print file. Both cover the whole head at the same scale, so they line up in your cutter software.

## Development

```sh
npm install
npm run dev              # http://localhost:5173
npm run dev -- --host    # also reachable from your phone on the same Wi-Fi
npm run build
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.
