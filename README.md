# Hexed Sequence

A fast, lightweight, fully client-side MIDI generator that fuses black metal's
rapid minor-scale intensity with trap and witch-house syncopation. Generate
seeded loops, audition them through a lo-fi Web Audio synth, and export clean
multi-track MIDI into your DAW.

No backend, no accounts — everything runs in the browser and your seed history
is saved to `localStorage`.

## Stack

- Vite + TypeScript
- React 19
- React Router (hash-based, so deep links work on static hosts)
- Tailwind CSS v4 + shadcn/ui
- Framer Motion
- Web Audio API (built-in synth, bitcrusher, distortion, low-pass)

## Development

```bash
bun install
bun run dev
```

## Build

```bash
bun run build
```

The output goes to `dist/`. Asset paths are relative (`base: "./"`), so the
build works from any subpath.

## Deploy to GitHub Pages

This repository includes `.github/workflows/deploy.yml`, which builds the Vite app and publishes the generated `dist/` folder automatically.

1. Push the repository to GitHub (the workflow file must be committed).
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main` or manually run **Deploy Hexed Sequence to GitHub Pages** from the Actions tab.

**Do not use “Deploy from a branch” with the project source folder.** GitHub Pages is a static host and does not run Vite/TypeScript compilation for you. The workflow is what turns `src/main.tsx` and the other source files into browser-ready files in `dist/`.

## Routes

- `/` — landing page
- `/#/studio` — the generator

The app uses hash routing (`/#/studio`) so GitHub Pages serves deep links
correctly without a 404 fallback.
