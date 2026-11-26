# Remotion Studio MCP Rules

When working on any video, composition, or component in the user's Remotion project (`remotion-studio` MCP):

- Always inspect available compositions (`list_compositions`), project files (`list_project_files`, `read_project_file`), and media assets (`list_assets`, `inspect_media`) before making edits.
- For `TimelineEditor` edits, prefer the structured timeline tools (`get_timeline`, `upsert_clip`, `remove_clip`, `upsert_text`, `remove_text`, `upsert_audio_track`, `set_color_grade`, `set_timeline`).
- For custom compositions, React effects, animations, transitions, or compositions created in Remotion Studio, edit or create `.tsx` files and `src/Root.tsx` using `write_project_file`, `edit_project_file`, or `create_composition`.
- Before cutting raw footage, use `inspect_media` and `extract_frames` so cuts never land on blank or blurry frames.
- After making code or visual changes, run `check_types` (`tsc --noEmit`) when `.ts`/`.tsx` files changed and verify key frames with `capture_frame` on the target `compositionId` before concluding.
- Only run `render_video` when the user asks to export the final video.
