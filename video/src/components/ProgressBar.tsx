import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS } from "../theme";
import { BANNER_HEIGHT } from "./TopBanner";

interface ProgressBarProps {
  slideIndex: number;
  totalSlides: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  slideIndex,
  totalSlides,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const targetProgress = ((slideIndex + 1) / totalSlides) * 100;
  const prevProgress = (slideIndex / totalSlides) * 100;

  // Animate from previous to current progress
  const animProgress = spring({
    frame,
    fps,
    config: { damping: 30, stiffness: 60 },
  });

  const width = interpolate(animProgress, [0, 1], [prevProgress, targetProgress]);

  return (
    <div
      style={{
        position: "absolute",
        top: BANNER_HEIGHT,
        left: 0,
        right: 0,
        height: 4,
        background: "rgba(255,255,255,0.08)",
        zIndex: 100,
      }}
    >
      {/* Filled portion */}
      <div
        style={{
          width: `${width}%`,
          height: "100%",
          background: COLORS.accent,
          borderRadius: "0 2px 2px 0",
          transition: "none",
        }}
      />

      {/* Glow on the leading edge */}
      <div
        style={{
          position: "absolute",
          top: -1,
          left: `${width - 0.5}%`,
          width: 12,
          height: 6,
          background: COLORS.accent,
          borderRadius: 3,
          boxShadow: `0 0 12px ${COLORS.accent}, 0 0 4px ${COLORS.accent}`,
          opacity: 0.8,
        }}
      />
    </div>
  );
};
