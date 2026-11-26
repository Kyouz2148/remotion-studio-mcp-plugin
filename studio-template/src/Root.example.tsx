import { type CalculateMetadataFunction, Composition } from "remotion";
import { TimelineEditorComposition } from "./TimelineEditorComposition";
import timelineData from "./data/timeline.json";
import {
  computeTotalDurationInFrames,
  type TimelineData,
  TimelineSchema,
} from "./data/timelineSchema";

const calculateTimelineMetadata: CalculateMetadataFunction<TimelineData> = ({
  props,
}) => {
  return {
    durationInFrames: computeTotalDurationInFrames(props),
    fps: props.fps,
    width: props.width,
    height: props.height,
  };
};

export const RemotionRoot: React.FC = () => {
  const defaultTimeline = TimelineSchema.parse(timelineData);

  return (
    <>
      <Composition
        id="TimelineEditor"
        component={TimelineEditorComposition}
        schema={TimelineSchema}
        defaultProps={defaultTimeline}
        calculateMetadata={calculateTimelineMetadata}
        durationInFrames={computeTotalDurationInFrames(defaultTimeline)}
        fps={defaultTimeline.fps}
        width={defaultTimeline.width}
        height={defaultTimeline.height}
      />
    </>
  );
};
