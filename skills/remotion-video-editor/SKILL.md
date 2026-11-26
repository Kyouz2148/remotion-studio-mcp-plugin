---
name: remotion-video-editor
description: >-
  Edit, structure, animate, and render videos in Remotion projects. Use when the
  user asks to edit a video in Remotion, modify compositions or timelines, trim
  clips, add animated typography or captions, mix/duck background audio, or
  render/preview frames in a Remotion workspace.
---

# Remotion Video Editor

Work cleanly inside the user's Remotion workspace so every edit is reproducible,
frame-accurate, and visually verified.

## Workflow

### 1. Inspect the Workspace and Media First

1. Read `package.json` and the entry files (`src/Root.tsx`, `src/index.ts`,
   and any `timeline.json` or `props` files) to learn:
   - Installed Remotion packages (`remotion`, `@remotion/media`,
     `@remotion/transitions`, `@remotion/player`, `@remotion/captions`).
   - Composition `id`, `width`, `height`, `fps`, and `durationInFrames`.
   - Whether the project uses a **data-driven timeline JSON** (shared with a
     visual timeline/editor UI) or direct React components.
2. Before cutting or placing overlays on any local video/audio asset, inspect it
   with `ffprobe` (duration, resolution, fps, audio presence) and extract a
   timestamped contact sheet or key frames with `ffmpeg` so cuts never land on
   dark, empty, or motion-blurred frames.

### 2. Preserve Shared Timeline State (When Present)

- If the project stores clips, tracks, texts, or styles in a JSON/state file
  (e.g., `timeline.json` or `props.json`), **edit that structured state** rather
  than hardcoding values inside components, so the visual timeline UI stays in
  sync with the agent's edits.
- Never overwrite unrelated user edits, tracks, or assets.

### 3. Frame Math, Motion, and Audio Craft

- **Frame math:** Compute all durations and offsets from the composition's
  `fps` (`Math.round(seconds * fps)`). Use `<Series>` or
  `<TransitionSeries>` (`@remotion/transitions`) when sequencing clips with
  transitions so total `durationInFrames` stays exact.
- **Minimalist motion:** Use `spring()` and `interpolate()` with
  `extrapolateLeft: 'clamp'` and `extrapolateRight: 'clamp'`. Prefer subtle
  fade + short slide/blur settles (around 8–18 frames at 30–60 fps) over
  bouncy presets.
- **Typography & safe zones:** Keep lower-thirds and chapter labels inside
  editorial safe margins (`~5%–8%` from edges) with clear contrast against the
  footage.
- **Audio mix:** Fade music smoothly in and out at clip/composition edges. If
  voice/dialogue is present, duck background music beneath spoken segments.
- **No browser/render surprises:** Avoid external runtime dependencies that can
  fail offline during headless rendering; place local media in `public/` and
  reference via `staticFile()`.

### 4. Verify Visually Before Finishing

1. Run TypeScript check (`npx tsc --noEmit`) when types/components changed.
2. Capture key frames directly from Remotion using `npx remotion still` at
   intro, transitions, text peaks, and outro frames (e.g.,
   `npx remotion still <CompId> out/check.png --frame=<N>`) and inspect the
   images to verify framing, legibility, and timing.
3. Only run full `npx remotion render` when the user asks for an exported video
   file or final verification.
