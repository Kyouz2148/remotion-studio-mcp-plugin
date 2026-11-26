import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  OffthreadVideo,
  Sequence,
  Series,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type {
  TimelineAudio,
  TimelineData,
  TimelineText,
} from "./data/timelineSchema";

const MinimalistTextOverlay: React.FC<{ readonly item: TimelineText }> = ({
  item,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const enterFrames = Math.min(20, Math.floor(durationInFrames / 3));
  const exitFrames = Math.min(18, Math.floor(durationInFrames / 3));

  const enter = interpolate(frame, [0, Math.max(1, enterFrames)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const exit = interpolate(
    frame,
    [Math.max(0, durationInFrames - exitFrames), durationInFrames],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.in(Easing.cubic),
    },
  );

  const opacity = Math.min(enter, exit);
  const offsetY =
    item.animation === "fade-slide" ? interpolate(enter, [0, 1], [16, 0]) : 0;

  const positionStyle: React.CSSProperties =
    item.position === "center"
      ? {
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }
      : item.position === "top-left"
        ? {
            left: 88,
            top: 76,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
          }
        : {
            left: 88,
            bottom: 84,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
          };

  return (
    <div
      style={{
        position: "absolute",
        pointerEvents: "none",
        opacity,
        transform: `translateY(${offsetY}px)`,
        fontFamily:
          '"Segoe UI Light", "Segoe UI", Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        textShadow: "0 2px 14px rgba(0, 0, 0, 0.55)",
        ...positionStyle,
      }}
    >
      {item.position !== "center" && (
        <div
          style={{
            width: 48,
            height: 2,
            backgroundColor: "rgba(244, 241, 234, 0.55)",
            marginBottom: 12,
          }}
        />
      )}
      {item.kicker ? (
        <div
          style={{
            fontSize: Math.max(14, Math.round(item.fontSize * 0.38)),
            fontWeight: 400,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(220, 214, 204, 0.85)",
            marginBottom: 8,
          }}
        >
          {item.kicker}
        </div>
      ) : null}
      <div
        style={{
          fontSize: item.fontSize,
          fontWeight: 300,
          letterSpacing: item.position === "center" ? "0.18em" : "0.03em",
          color: item.color,
          lineHeight: 1.15,
        }}
      >
        {item.text}
      </div>
    </div>
  );
};

const TimelineAudioLayer: React.FC<{ readonly track: TimelineAudio }> = ({
  track,
}) => {
  return (
    <Sequence
      from={track.startFrame}
      durationInFrames={track.durationInFrames}
      layout="none"
    >
      <Audio
        src={staticFile(track.src)}
        volume={(f) => {
          const fadeIn =
            track.fadeInFrames > 0
              ? interpolate(f, [0, track.fadeInFrames], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                })
              : 1;
          const fadeOut =
            track.fadeOutFrames > 0
              ? interpolate(
                  f,
                  [
                    Math.max(0, track.durationInFrames - track.fadeOutFrames),
                    track.durationInFrames,
                  ],
                  [1, 0],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  },
                )
              : 1;
          return track.volume * Math.min(fadeIn, fadeOut);
        }}
      />
    </Sequence>
  );
};

export const TimelineEditorComposition: React.FC<TimelineData> = ({
  backgroundColor,
  colorGrade,
  clips,
  texts,
  audioTracks,
}) => {
  const videoFilter = `brightness(${colorGrade.brightness}) contrast(${colorGrade.contrast}) saturate(${colorGrade.saturate})`;

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      <AbsoluteFill style={{ filter: videoFilter }}>
        <Series>
          {clips.map((clip) => (
            <Series.Sequence
              key={clip.id}
              durationInFrames={clip.durationInFrames}
            >
              <OffthreadVideo
                src={staticFile(clip.src)}
                startFrom={clip.trimBeforeFrames}
                endAt={clip.trimBeforeFrames + clip.durationInFrames}
                volume={clip.volume}
                muted={clip.muted}
                playbackRate={clip.playbackRate}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
              />
            </Series.Sequence>
          ))}
        </Series>
      </AbsoluteFill>

      {colorGrade.vignette > 0 && (
        <AbsoluteFill
          style={{
            pointerEvents: "none",
            background: `radial-gradient(circle at center, rgba(0,0,0,0) 52%, rgba(0,0,0,${colorGrade.vignette}) 100%)`,
          }}
        />
      )}

      {texts.map((item) => (
        <Sequence
          key={item.id}
          from={item.startFrame}
          durationInFrames={item.durationInFrames}
          layout="none"
        >
          <MinimalistTextOverlay item={item} />
        </Sequence>
      ))}

      {audioTracks.map((track) => (
        <TimelineAudioLayer key={track.id} track={track} />
      ))}
    </AbsoluteFill>
  );
};
