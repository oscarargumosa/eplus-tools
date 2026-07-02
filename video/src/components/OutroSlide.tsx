import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { COLORS, FONTS, LAYOUT } from "../theme";
import type { OutroSlide as OutroSlideData } from "../types";
import { SlideLayout } from "./SlideLayout";
import { useFadeIn, useScaleIn, useFloat, usePulse, useGlow } from "./animations";

export const OutroSlide: React.FC<{ data: OutroSlideData }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const logoAnim = useScaleIn(0);
  const titleAnim = useFadeIn(15);
  const subtitleAnim = useFadeIn(25);
  const ctaAnim = useFadeIn(35);
  const socialAnim = useFadeIn(50);

  // Continuous motions
  const logoFloat = useFloat(3, 0.025, 0);
  const logoPulse = usePulse(0.97, 1.03, 0.04, 0);
  const ctaFloat = useFloat(2, 0.03, 1);

  // CTA glow
  const glowIntensity = 10 + 8 * Math.sin(frame * 0.12);
  const glowSpread = 24 + 12 * Math.sin(frame * 0.12);

  // Expanding rings behind CTA
  const ring1 = interpolate(frame, [35, durationInFrames], [0.6, 1.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ring2 = interpolate(frame, [45, durationInFrames], [0.5, 1.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SlideLayout
      variant={data.variant ?? "dark"}
      showLogo={false}
      showWatermark={false}
      seed={77}
    >
      {/* Expanding rings */}
      {[ring1, ring2].map((scale, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 300,
            height: 300,
            borderRadius: "50%",
            border: `1.5px solid ${COLORS.accent}`,
            transform: `translate(-50%, -50%) scale(${scale})`,
            opacity: 0.04 + 0.02 * Math.sin(frame * 0.03 + i),
            pointerEvents: "none",
          }}
        />
      ))}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 20,
        }}
      >
        {/* Logo with float + pulse */}
        <div style={{ ...logoFloat, ...logoPulse }}>
          <div
            style={{
              ...logoAnim,
              fontSize: FONTS.sizes.title,
              fontWeight: FONTS.weights.extraBold,
              letterSpacing: 3,
            }}
          >
            EU FUNDING SCHOOL
          </div>
        </div>

        {/* Accent line */}
        <div
          style={{
            ...useFadeIn(10),
            width: 80,
            height: 4,
            background: COLORS.accent,
            borderRadius: 2,
            boxShadow: `0 0 ${6 + 3 * Math.sin(frame * 0.06)}px rgba(231,235,0,0.4)`,
          }}
        />

        {/* Title */}
        {data.title && (
          <h2
            style={{
              ...titleAnim,
              ...useFloat(1.5, 0.02, 2),
              fontSize: FONTS.sizes.subtitle,
              fontWeight: FONTS.weights.bold,
              margin: 0,
            }}
          >
            {data.title}
          </h2>
        )}

        {/* Subtitle */}
        {data.subtitle && (
          <p
            style={{
              ...subtitleAnim,
              fontSize: FONTS.sizes.body,
              fontWeight: FONTS.weights.regular,
              opacity: subtitleAnim.opacity * 0.65,
              margin: 0,
            }}
          >
            {data.subtitle}
          </p>
        )}

        {/* CTA button with pulsing glow */}
        {data.cta && (
          <div style={{ ...ctaFloat, marginTop: 20 }}>
            <div
              style={{
                ...ctaAnim,
                background: COLORS.accent,
                color: COLORS.primary,
                padding: "20px 64px",
                borderRadius: LAYOUT.borderRadius.xl,
                fontSize: FONTS.sizes.heading,
                fontWeight: FONTS.weights.extraBold,
                letterSpacing: 1,
                boxShadow: `0 0 ${glowIntensity}px ${COLORS.accent}, 0 0 ${glowSpread}px rgba(231, 235, 0, 0.3)`,
              }}
            >
              {data.cta}
            </div>
          </div>
        )}

        {/* Social proof */}
        <div
          style={{
            ...socialAnim,
            ...useFloat(1, 0.02, 4),
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 8,
          }}
        >
          {/* Avatar dots */}
          <div style={{ display: "flex", marginRight: 4 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  background: [
                    COLORS.surfaceTint,
                    COLORS.accent,
                    COLORS.onPrimaryContainer,
                    COLORS.success,
                    COLORS.accentDim,
                  ][i],
                  border: `2px solid ${COLORS.primary}`,
                  marginLeft: i > 0 ? -8 : 0,
                  opacity: useGlow(0.7, 1, 0.04, i * 1.2),
                }}
              />
            ))}
          </div>
          <span
            style={{
              fontSize: FONTS.sizes.caption,
              fontWeight: FONTS.weights.semiBold,
              opacity: 0.75,
            }}
          >
            Únete a 2.400+ coordinadores de proyectos
          </span>
        </div>

        {/* Website */}
        <p
          style={{
            ...useFadeIn(60),
            fontSize: FONTS.sizes.caption,
            opacity: 0.35,
            margin: 0,
            marginTop: 8,
            letterSpacing: 2,
          }}
        >
          eufundingschool.com
        </p>
      </div>
    </SlideLayout>
  );
};
