import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { evolvePath } from "@remotion/paths";
import { COLORS } from "../theme";

interface DrawPathProps {
  d: string;                    // SVG path data
  delay?: number;               // frames before drawing starts
  duration?: number;            // frames to complete drawing
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  width?: number;
  height?: number;
}

/**
 * SVG path that "draws itself" from start to end.
 * Uses @remotion/paths evolvePath() for the animation.
 */
export const DrawPath: React.FC<DrawPathProps> = ({
  d,
  delay = 0,
  duration = 40,
  stroke = COLORS.accent,
  strokeWidth = 3,
  fill = "none",
  width = 200,
  height = 200,
}) => {
  const frame = useCurrentFrame();

  const progress = interpolate(frame - delay, [0, duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const evolved = evolvePath(progress, d);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path
        d={d}
        stroke={stroke}
        strokeWidth={strokeWidth}
        fill={fill}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={evolved.strokeDasharray}
        strokeDashoffset={evolved.strokeDashoffset}
      />
    </svg>
  );
};

// ── Pre-built path shapes ────────────────────────────────────

/** Arrow pointing right */
export const ARROW_RIGHT = "M 10 50 L 150 50 L 130 30 M 150 50 L 130 70";

/** Checkmark */
export const CHECKMARK = "M 20 55 L 45 80 L 90 25";

/** Circle (approximate with bezier) */
export const CIRCLE_PATH =
  "M 50 10 C 72 10 90 28 90 50 C 90 72 72 90 50 90 C 28 90 10 72 10 50 C 10 28 28 10 50 10 Z";

/** Star 5-point */
export const STAR_PATH =
  "M 50 5 L 61 35 L 95 35 L 68 55 L 79 90 L 50 70 L 21 90 L 32 55 L 5 35 L 39 35 Z";

/** Underline swoosh */
export const SWOOSH = "M 10 50 Q 50 80 90 45 Q 130 30 170 50";

/** Connecting line with curve */
export const CONNECTOR = "M 10 50 C 40 10 60 90 90 50";
