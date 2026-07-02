import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COLORS, VIDEO } from "../theme";
import type { SlideVariant } from "../types";

interface DecorativeShapesProps {
  variant?: SlideVariant;
  seed?: number;
}

/**
 * Floating decorative shapes that add visual weight and constant motion.
 * These fill empty space and keep the eye engaged.
 */
export const DecorativeShapes: React.FC<DecorativeShapesProps> = ({
  variant = "dark",
  seed = 0,
}) => {
  const frame = useCurrentFrame();

  const accentColor = variant === "light" ? COLORS.primary : COLORS.accent;
  const shapeColor = variant === "light" ? COLORS.primary : COLORS.white;

  return (
    <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none" }}>
      {/* Large accent circle — top right, slowly drifting */}
      <div
        style={{
          position: "absolute",
          top: -80 + Math.sin(frame * 0.012 + seed) * 20,
          right: -60 + Math.cos(frame * 0.01 + seed) * 15,
          width: 320,
          height: 320,
          borderRadius: "50%",
          border: `2px solid ${accentColor}`,
          opacity: 0.08 + 0.03 * Math.sin(frame * 0.03),
        }}
      />

      {/* Medium circle — bottom left */}
      <div
        style={{
          position: "absolute",
          bottom: -40 + Math.cos(frame * 0.015 + seed + 1) * 18,
          left: -30 + Math.sin(frame * 0.013 + seed + 1) * 12,
          width: 200,
          height: 200,
          borderRadius: "50%",
          background: accentColor,
          opacity: 0.04 + 0.02 * Math.sin(frame * 0.025 + 2),
        }}
      />

      {/* Accent bar — right side, moves vertically */}
      <div
        style={{
          position: "absolute",
          right: 40,
          top: 200 + Math.sin(frame * 0.02 + seed) * 60,
          width: 4,
          height: 120 + 30 * Math.sin(frame * 0.03),
          borderRadius: 2,
          background: accentColor,
          opacity: 0.12 + 0.05 * Math.sin(frame * 0.04),
        }}
      />

      {/* Small floating squares */}
      {[0, 1, 2].map((i) => {
        const baseX = [VIDEO.width * 0.85, VIDEO.width * 0.1, VIDEO.width * 0.7][i];
        const baseY = [VIDEO.height * 0.15, VIDEO.height * 0.8, VIDEO.height * 0.6][i];
        const size = [16, 12, 20][i];
        const speed = [0.018, 0.022, 0.015][i];
        const rotation = frame * (0.3 + i * 0.2);

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: baseX + Math.sin(frame * speed + i * 2 + seed) * 30,
              top: baseY + Math.cos(frame * speed * 0.8 + i * 3 + seed) * 25,
              width: size,
              height: size,
              borderRadius: i === 1 ? "50%" : 2,
              border: `1.5px solid ${shapeColor}`,
              opacity: 0.08 + 0.04 * Math.sin(frame * 0.04 + i),
              transform: `rotate(${rotation}deg)`,
            }}
          />
        );
      })}

      {/* Dotted line — horizontal accent */}
      <div
        style={{
          position: "absolute",
          bottom: 120,
          right: 60 + Math.sin(frame * 0.01) * 20,
          display: "flex",
          gap: 8,
          opacity: 0.1,
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 4,
              height: 4,
              borderRadius: 2,
              background: accentColor,
              opacity: 0.5 + 0.5 * Math.sin(frame * 0.06 + i * 0.8),
            }}
          />
        ))}
      </div>

      {/* Corner accent — bottom right triangle */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          right: 0,
          width: 0,
          height: 0,
          borderBottom: `80px solid ${accentColor}`,
          borderLeft: "80px solid transparent",
          opacity: 0.05 + 0.02 * Math.sin(frame * 0.03),
        }}
      />
    </AbsoluteFill>
  );
};
