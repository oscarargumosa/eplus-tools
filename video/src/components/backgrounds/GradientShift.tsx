import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS } from "../../theme";

interface GradientShiftProps {
  variant?: "dark" | "light" | "accent";
}

export const GradientShift: React.FC<GradientShiftProps> = ({
  variant = "dark",
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Slowly rotate gradient angle over the life of the slide
  const angle = interpolate(frame, [0, durationInFrames], [135, 200], {
    extrapolateRight: "clamp",
  });

  // Subtle color shift via opacity overlay
  const overlayOpacity = 0.03 + 0.02 * Math.sin(frame * 0.02);

  const colors =
    variant === "dark"
      ? { from: COLORS.primary, to: COLORS.primaryContainer, overlay: COLORS.surfaceTint }
      : variant === "accent"
        ? { from: COLORS.primaryContainer, to: COLORS.surfaceTint, overlay: COLORS.accent }
        : { from: COLORS.white, to: COLORS.surfaceContainerLow, overlay: COLORS.primary };

  return (
    <AbsoluteFill>
      {/* Main gradient */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(${angle}deg, ${colors.from} 0%, ${colors.to} 100%)`,
        }}
      />

      {/* Animated color overlay */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at ${50 + 20 * Math.sin(frame * 0.015)}% ${50 + 15 * Math.cos(frame * 0.012)}%, ${colors.overlay} 0%, transparent 70%)`,
          opacity: overlayOpacity,
        }}
      />

      {/* Vignette */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.3) 100%)",
          opacity: variant === "light" ? 0.08 : 0.15,
        }}
      />
    </AbsoluteFill>
  );
};
