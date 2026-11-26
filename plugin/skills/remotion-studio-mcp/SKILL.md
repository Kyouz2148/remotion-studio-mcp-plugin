---
name: remotion-studio-mcp
description: >-
  Full-featured Remotion Studio editing via the Streamable HTTP MCP server
  (`remotion-studio`). Use whenever the user asks to create, inspect, edit,
  animate, cut, verify, or render ANY Remotion composition, React video
  component, or timeline in their Remotion project.
---

# Remotion Studio MCP Workflow

Use the `remotion-studio` MCP tools to work directly on the Remotion Studio
project so `npm run dev` reloads live.

## Choosing the Right Editing Path

1. **Any existing or new React/TSX composition**:
   - Discover files and compositions: `list_compositions`, `list_project_files`, `read_project_file`.
   - Create or modify TSX code: `create_composition`, `write_project_file`, `edit_project_file`.
   - Validate TypeScript: `check_types`.
2. **Structured `TimelineEditor` composition** (`src/data/timeline.json`):
   - Quick cuts, minimalist animated texts, audio fades, and color grading without touching TSX: `get_timeline`, `upsert_clip`, `remove_clip`, `upsert_text`, `remove_text`, `upsert_audio_track`, `set_color_grade`, `set_timeline`.

## Media & Visual Verification

1. **Assets & Import**:
   - Check `studio/public/` with `list_assets`.
   - Import media from `IMPORT_ROOT_DIR` with `import_media_from_drive`.
   - Always probe media (`inspect_media`) and inspect scenes (`extract_frames`) before picking cut timestamps.
2. **Verify visually before concluding**:
   - Call `capture_frame` on the target `compositionId` at key frames (intro, cuts, text overlays, outro) and inspect the returned image.
3. **Export when asked**:
   - Call `render_video` with the target `compositionId` (`saveToDrive: true` to export into `EXPORT_DIR`, or `false` for `studio/out/`).
