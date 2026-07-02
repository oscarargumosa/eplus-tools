import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS } from "../theme";

interface AudioVisualizerProps {
  /** Number of bars */
  bars?: number;
  /** Bar width in px */
  barWidth?: number;
  /** Max bar height in px */
  maxHeight?: number;
  /** Color of bars */
  color?: string;
  /** Position */
  position?: "bottom" | "top";
  /** Overall opacity */
  opacity?: number;
}

/**
 * Simulated audio visualizer bars.
 * Uses deterministic pseudo-random based on frame for consistent renders.
 * When we have real audio data, this can be replaced with visualizeAudio().
 */
export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  bars = 40,
  barWidth = 4,
  maxHeight = 60,
  color = COLORS.accent,
  position = "bottom",
  opacity = 0.3,
}) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        position: "absolute",
        [position]: 30,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: position === "bottom" ? "flex-end" : "flex-start",
        gap: 3,
        height: maxHeight,
        opacity,
        pointerEvents: "none",
        zIndex: 5,
      }}
    >
      {Array.from({ length: bars }).map((_, i) => {
        // Multiple sine waves at different frequencies for organic look
        const h1 = Math.sin(frame * 0.12 + i * 0.5) * 0.5 + 0.5;
        const h2 = Math.sin(frame * 0.08 + i * 0.8 + 2) * 0.3 + 0.3;
        const h3 = Math.sin(frame * 0.2 + i * 0.3 + 4) * 0.2 + 0.2;
        const height = (h1 + h2 + h3) * maxHeight * 0.5 + 4;

        return (
          <div
            key={i}
            style={{
              width: barWidth,
              height,
              borderRadius: barWidth / 2,
              background: color,
              opacity: 0.4 + 0.6 * h1,
            }}
          />
        );
      })}
    </div>
  );
};
