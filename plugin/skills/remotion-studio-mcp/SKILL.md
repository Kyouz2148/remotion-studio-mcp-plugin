---
name: remotion-studio-mcp
description: >-
  Full-featured Remotion Studio editing via the Streamable HTTP MCP server
  (`remotion-studio`). Use whenever the user asks to create, inspect, edit,
  animate, cut, verify, or render ANY Remotion composition, React video
  component, or timeline in their Remotion project.
---

# Remotion Studio MCP Workflow (Full Project)

Use the `remotion-studio` MCP tools to work directly on the Remotion Studio
project so `npm run dev` reloads live.

## Mandatory Timeline & Editability Standards

1. **Everything must be clearly described on the timeline**:
   - Always pass a descriptive `name="..."` prop on every `<Sequence>`,
     `<Series.Sequence>`, `<Video>`, `<OffthreadVideo>`, `<Audio>`, and `<Img>`
     so the user immediately understands every track in Remotion Studio.
2. **Everything created by the agent must remain editable by the user**:
   - Register a Zod `schema` and `defaultProps` on `<Composition>` in
     `src/Root.tsx` so texts, colors, sizes, timings, and audio levels are
     editable in Remotion Studio's **Props (`{}`)** form.
   - When creating or editing custom `.tsx` compositions (outside
     `TimelineEditor`) that the user may drag, trim, split, or transform
     directly on the Studio timeline, write **explicit `<Sequence name="...">`
     blocks** in TSX rather than opaque `.map()` loops.
   - Always read the current `.tsx` file (`read_project_file`) before editing so
     manual changes made by the user in Remotion Studio are preserved.

## Choosing the Right Editing Path

1. **Custom / Studio-editable React/TSX compositions**:
   - Discover files and compositions: `list_compositions`, `list_project_files`, `read_project_file`.
   - Create or modify TSX code: `create_composition`, `write_project_file`, `edit_project_file`.
   - Validate TypeScript: `check_types`.
2. **Structured `TimelineEditor` composition** (`src/data/timeline.json`):
   - Quick cuts, minimalist animated texts, audio fades, and color grading via
     JSON + Studio Props (`{}`): `get_timeline`, `upsert_clip`, `remove_clip`,
     `upsert_text`, `remove_text`, `upsert_audio_track`, `set_color_grade`,
     `set_timeline`.

## Media & Visual Verification

1. **Assets & Import**:
   - Check `studio/public/` with `list_assets`.
   - Import media from `IMPORT_ROOT_DIR` with `import_media_from_drive`.
   - Always probe media (`inspect_media`) and inspect scenes (`extract_frames`) before picking cut timestamps.
2. **Verify visually before concluding**:
   - Call `capture_frame` on the target `compositionId` at key frames (intro, cuts, text overlays, outro) and inspect the returned image.
3. **Export when asked**:
   - Call `render_video` with the target `compositionId` (`saveToDrive: true` to export into `EXPORT_DIR`, or `false` for `studio/out/`).
