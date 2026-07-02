import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { COLORS, FONTS, LAYOUT } from "../theme";
import type { IntroSlide as IntroSlideData } from "../types";
import { SlideLayout } from "./SlideLayout";
import { useFadeIn, useScaleIn, useFloat, usePulse, useGlow } from "./animations";

export const IntroSlide: React.FC<{ data: IntroSlideData }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const tagAnim = useScaleIn(0);
  const titleAnim = useFadeIn(15);
  const subtitleAnim = useFadeIn(35);
  const logoAnim = useFadeIn(50);

  // Continuous motions
  const tagFloat = useFloat(3, 0.03, 0);
  const titleFloat = useFloat(2, 0.02, 1);
  const logoPulse = usePulse(0.98, 1.02, 0.04, 0);
  const lineGlow = useGlow(0.6, 1, 0.05, 0);

  // Accent line draws across slowly
  const lineWidth = interpolate(frame, [20, 60], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Decorative ring that expands
  const ringScale = interpolate(frame, [0, durationInFrames], [0.8, 1.4], {
    extrapolateRight: "clamp",
  });
  const ringOpacity = interpolate(frame, [0, durationInFrames * 0.3, durationInFrames], [0, 0.06, 0.02], {
    extrapolateRight: "clamp",
  });

  return (
    <SlideLayout variant={data.variant ?? "dark"} imageUrl={data.imageUrl} images={data.images}>
      {/* Expanding decorative ring behind content */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: 600,
          height: 600,
          borderRadius: "50%",
          border: `2px solid ${COLORS.accent}`,
          transform: `translate(-50%, -50%) scale(${ringScale})`,
          opacity: ringOpacity,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 20,
        }}
      >
        {/* Tag badge with continuous float */}
        {data.tag && (
          <div style={{ ...tagFloat }}>
            <div
              style={{
                ...tagAnim,
                background: COLORS.accent,
                color: COLORS.primary,
                padding: "10px 32px",
                borderRadius: LAYOUT.borderRadius.xl,
                fontSize: FONTS.sizes.caption,
                fontWeight: FONTS.weights.bold,
                letterSpacing: 3,
                textTransform: "uppercase",
                boxShadow: `0 0 ${12 + 6 * Math.sin(frame * 0.06)}px rgba(231,235,0,0.3)`,
              }}
            >
              {data.tag}
            </div>
          </div>
        )}

        {/* Title with continuous subtle movement */}
        <div style={{ ...titleFloat }}>
          <h1
            style={{
              ...titleAnim,
              fontSize: FONTS.sizes.hero,
              fontWeight: FONTS.weights.extraBold,
              lineHeight: 1.1,
              margin: 0,
              maxWidth: 1400,
            }}
          >
            {data.title}
          </h1>
        </div>

        {/* Animated accent line */}
        <div
          style={{
            width: `${lineWidth}%`,
            maxWidth: 160,
            height: 5,
            background: COLORS.accent,
            borderRadius: 3,
            opacity: lineGlow,
            boxShadow: `0 0 8px rgba(231,235,0,0.4)`,
          }}
        />

        {/* Subtitle with staggered entry */}
        {data.subtitle && (
          <p
            style={{
              ...subtitleAnim,
              ...useFloat(2, 0.018, 2),
              fontSize: FONTS.sizes.subtitle,
              fontWeight: FONTS.weights.regular,
              opacity: subtitleAnim.opacity * 0.8,
              margin: 0,
              maxWidth: 1100,
            }}
          >
            {data.subtitle}
          </p>
        )}

        {/* Logo with pulse */}
        <div
          style={{
            ...logoAnim,
            ...logoPulse,
            marginTop: 32,
            fontSize: FONTS.sizes.heading,
            fontWeight: FONTS.weights.bold,
            letterSpacing: 3,
            opacity: logoAnim.opacity * 0.85,
          }}
        >
          EU FUNDING SCHOOL
        </div>
      </div>
    </SlideLayout>
  );
};
