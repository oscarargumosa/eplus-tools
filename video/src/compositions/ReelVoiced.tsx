import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  useVideoConfig,
} from "remotion";
import {
  TransitionSeries,
  linearTiming,
} from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { fade } from "@remotion/transitions/fade";
import { FONTS } from "../theme";
import { REEL } from "../reels-config";
import { TikTokCaptions, generateCaptionPages } from "../components/TikTokCaptions";

// Import the scene renderers from ReelFactory
import { ReelFactory } from "./ReelFactory";
import type { ReelData } from "./ReelFactory";

interface ReelVoicedProps {
  data: ReelData;
  audioFolder: string;
  narrations: string[];
  audioDurations: number[];  // seconds per narration
}

export const ReelVoiced: React.FC<ReelVoicedProps> = ({
  data,
  audioFolder,
  narrations,
  audioDurations,
}) => {
  const { fps } = useVideoConfig();

  // Calculate slide starts
  const slideStarts: number[] = [];
  const slideDurations: number[] = [];
  let acc = 0;
  for (let i = 0; i < data.scenes.length; i++) {
    slideStarts.push(acc);
    const dur = Math.round(data.scenes[i].duration * fps);
    slideDurations.push(dur);
    acc += dur;
    if (i < data.scenes.length - 1) acc -= REEL.timing.transitionFrames;
  }

  return (
    <AbsoluteFill style={{ fontFamily: FONTS.family }}>
      {/* Visual layer (ReelFactory handles transitions + music) */}
      <ReelFactory data={data} />

      {/* Narration audio layer (on top, outside TransitionSeries) */}
      {narrations.map((narration, i) => {
        if (i >= data.scenes.length) return null;
        const audioDur = audioDurations[i]
          ? Math.round(audioDurations[i] * fps)
          : slideDurations[i];

        return (
          <Sequence
            key={`voice-${i}`}
            from={slideStarts[i]}
            durationInFrames={slideDurations[i]}
          >
            <Audio
              src={staticFile(`audio/${audioFolder}/slide-${String(i).padStart(2, "0")}.wav`)}
              volume={1.5}
            />
          </Sequence>
        );
      })}

      {/* TikTok captions layer */}
      {narrations.map((narration, i) => {
        if (i >= data.scenes.length) return null;
        const audioDur = audioDurations[i]
          ? Math.round(audioDurations[i] * fps)
          : slideDurations[i] - 20;

        const pages = generateCaptionPages(narration, 0, audioDur, 4, fps);

        return (
          <Sequence
            key={`captions-${i}`}
            from={slideStarts[i]}
            durationInFrames={slideDurations[i]}
          >
            <TikTokCaptions
              pages={pages}
              position="center"
              fontSize={44}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
