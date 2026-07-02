import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  spring,
} from "remotion";

interface SlideTransitionProps {
  children: React.ReactNode;
  durationInFrames: number;
  transitionFrames?: number; // frames for enter/exit transition
}

export const SlideTransition: React.FC<SlideTransitionProps> = ({
  children,
  durationInFrames,
  transitionFrames = 10,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Enter animation (first N frames)
  const enterProgress = spring({
    frame,
    fps,
    config: { damping: 22, stiffness: 80 },
  });

  // Exit animation (last N frames)
  const exitStart = durationInFrames - transitionFrames;
  const exitProgress =
    frame >= exitStart
      ? interpolate(frame, [exitStart, durationInFrames], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  const opacity = Math.min(enterProgress, exitProgress);
  const scale = interpolate(
    Math.min(enterProgress, exitProgress),
    [0, 1],
    [1.02, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const translateX = interpolate(enterProgress, [0, 1], [40, 0]);

  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: `scale(${scale}) translateX(${frame < transitionFrames ? translateX : 0}px)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
