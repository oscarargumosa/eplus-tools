import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { noise3D } from "@remotion/noise";
import { COLORS, VIDEO } from "../../theme";
import type { SlideVariant } from "../../types";

interface NoiseBackgroundProps {
  variant?: SlideVariant;
  speed?: number;
  scale?: number;
  opacity?: number;
}

/**
 * Organic flowing background using Perlin noise.
 * Creates a smoke/cloud effect that constantly moves.
 */
export const NoiseBackground: React.FC<NoiseBackgroundProps> = ({
  variant = "dark",
  speed = 0.008,
  scale = 0.003,
  opacity = 0.15,
}) => {
  const frame = useCurrentFrame();

  const accentColor =
    variant === "light" ? COLORS.primary : COLORS.accent;

  // Generate noise grid (low resolution for performance)
  const COLS = 24;
  const ROWS = 14;
  const cellW = VIDEO.width / COLS;
  const cellH = VIDEO.height / ROWS;

  const cells = useMemo(() => {
    const result = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        result.push({ row, col });
      }
    }
    return result;
  }, []);

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {cells.map(({ row, col }) => {
        const n = noise3D(
          "bg",
          col * scale * 50,
          row * scale * 50,
          frame * speed
        );
        // Map noise [-1,1] to opacity [0, opacity]
        const cellOpacity = (n + 1) * 0.5 * opacity;

        return (
          <div
            key={`${row}-${col}`}
            style={{
              position: "absolute",
              left: col * cellW,
              top: row * cellH,
              width: cellW + 1,
              height: cellH + 1,
              background: accentColor,
              opacity: cellOpacity,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
