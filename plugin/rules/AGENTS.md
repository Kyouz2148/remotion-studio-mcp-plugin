# Remotion Studio MCP Rules

When working on any video, composition, or component in the user's Remotion project (`remotion-studio` MCP):

- Always inspect available compositions (`list_compositions`), project files (`list_project_files`, `read_project_file`), and media assets (`list_assets`, `inspect_media`) before making edits.
- **Clear timeline descriptions (mandatory):** Every `<Sequence>`, `<Series.Sequence>`, `<Video>`, `<OffthreadVideo>`, `<Audio>`, or `<Img>` generated or edited by the agent MUST include a clear, human-readable `name="..."` prop (e.g. `name="🎬 Vídeo Principal"`, `name="✍️ Título: Introdução"`, `name="🎵 Trilha de Fundo"`). Never leave generic unnamed timeline layers.
- **Always editable in Remotion Studio (mandatory):**
  - Expose configurable values (texts, colors, font sizes, timings, volumes) via a Zod `schema` + `defaultProps` on `<Composition>` in `src/Root.tsx` so the user can edit them in Remotion Studio's visual **Props (`{}`)** panel.
  - When building or editing custom `.tsx` compositions meant to be tweaked directly on the Studio timeline (dragging, trimming, splitting, Transform/Crop), write explicit named `<Sequence name="...">` blocks in TSX rather than hiding elements inside `.map()` loops, and always `read_project_file` first so manual Studio edits by the user are preserved.
  - For `TimelineEditor` quick edits, use the structured timeline tools (`get_timeline`, `upsert_clip`, `remove_clip`, `upsert_text`, `remove_text`, `upsert_audio_track`, `set_color_grade`, `set_timeline`).
- Before cutting raw footage, use `inspect_media` and `extract_frames` so cuts never land on blank or blurry frames.
- After making code or visual changes, run `check_types` (`tsc --noEmit`) when `.ts`/`.tsx` files changed and verify key frames with `capture_frame` on the target `compositionId` before concluding.
- Only run `render_video` when the user asks to export the final video.
