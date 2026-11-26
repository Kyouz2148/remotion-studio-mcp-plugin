import { z } from "zod";

export const ColorGradeSchema = z.object({
  brightness: z.number().min(0.2).max(2.5),
  contrast: z.number().min(0.2).max(2.5),
  saturate: z.number().min(0.2).max(2.5),
  vignette: z.number().min(0).max(1),
});

export const TimelineClipSchema = z.object({
  id: z.string().min(1),
  src: z.string().min(1),
  trimBeforeFrames: z.number().int().min(0).default(0),
  durationInFrames: z.number().int().min(1),
  volume: z.number().min(0).max(2).default(1),
  muted: z.boolean().default(false),
  playbackRate: z.number().min(0.25).max(4).default(1),
});

export const TimelineTextSchema = z.object({
  id: z.string().min(1),
  kicker: z.string().optional(),
  text: z.string().min(1),
  startFrame: z.number().int().min(0),
  durationInFrames: z.number().int().min(1),
  position: z.enum(["bottom-left", "center", "top-left"]).default("bottom-left"),
  animation: z.enum(["fade-slide", "fade"]).default("fade-slide"),
  color: z.string().default("#F4F1EA"),
  fontSize: z.number().min(16).max(160).default(54),
});

export const TimelineAudioSchema = z.object({
  id: z.string().min(1),
  src: z.string().min(1),
  startFrame: z.number().int().min(0).default(0),
  durationInFrames: z.number().int().min(1),
  volume: z.number().min(0).max(2).default(0.35),
  fadeInFrames: z.number().int().min(0).default(30),
  fadeOutFrames: z.number().int().min(0).default(60),
});

export const TimelineSchema = z.object({
  title: z.string().default("Timeline Editor"),
  fps: z.number().int().min(1).max(120).default(60),
  width: z.number().int().min(64).max(7680).default(1920),
  height: z.number().int().min(64).max(4320).default(1080),
  backgroundColor: z.string().default("#0D0E11"),
  colorGrade: ColorGradeSchema.default({
    brightness: 1,
    contrast: 1,
    saturate: 1,
    vignette: 0,
  }),
  clips: z.array(TimelineClipSchema).default([]),
  texts: z.array(TimelineTextSchema).default([]),
  audioTracks: z.array(TimelineAudioSchema).default([]),
});

export function computeTotalDurationInFrames(data) {
  const clipsTotal = (data.clips || []).reduce(
    (sum, clip) => sum + clip.durationInFrames,
    0,
  );
  const textsMax = (data.texts || []).reduce(
    (max, item) => Math.max(max, item.startFrame + item.durationInFrames),
    0,
  );
  const audioMax = (data.audioTracks || []).reduce(
    (max, track) => Math.max(max, track.startFrame + track.durationInFrames),
    0,
  );
  return Math.max(1, clipsTotal, textsMax, audioMax);
}
