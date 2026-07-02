import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS, LAYOUT } from "../theme";
import type { BulletSlide as BulletSlideData } from "../types";
import { SlideLayout } from "./SlideLayout";
import { useFadeIn, useProgressiveReveal, useFloat, useGlow, useUnderlineDraw } from "./animations";

export const BulletSlide: React.FC<{ data: BulletSlideData }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const variant = data.variant ?? "light";
  const accentColor = variant === "light" ? COLORS.primary : COLORS.accent;
  const dimColor = variant === "light" ? COLORS.outline : COLORS.outlineVariant;
  const titleAnim = useFadeIn(0);
  const underlineWidth = useUnderlineDraw(12, 40);
  const titleFloat = useFloat(2, 0.025, 0);

  return (
    <SlideLayout variant={variant} seed={data.bullets.length} imageUrl={data.imageUrl} images={data.images}>
      <div style={{ display: "flex", gap: 60 }}>
        {/* Left side: Title + accent column */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            flex: "0 0 420px",
          }}
        >
          {/* Title with continuous float */}
          <div style={{ ...titleFloat }}>
            <h2
              style={{
                ...titleAnim,
                fontSize: FONTS.sizes.title,
                fontWeight: FONTS.weights.extraBold,
                margin: 0,
                lineHeight: 1.15,
              }}
            >
              {data.title}
            </h2>

            {/* Animated underline */}
            <div
              style={{
                height: 4,
                background: accentColor,
                borderRadius: 2,
                marginTop: 12,
                width: underlineWidth,
                maxWidth: 200,
              }}
            />
          </div>

          {/* Vertical accent bar that grows */}
          <div
            style={{
              width: 3,
              background: `linear-gradient(to bottom, ${accentColor}, transparent)`,
              borderRadius: 2,
              opacity: 0.2,
              flex: 1,
              maxHeight: 300,
              alignSelf: "flex-start",
              marginLeft: 4,
            }}
          />

          {/* Counter showing current bullet */}
          <div
            style={{
              fontSize: FONTS.sizes.hero,
              fontWeight: FONTS.weights.extraBold,
              opacity: 0.06,
              lineHeight: 1,
            }}
          >
            {String(data.bullets.length).padStart(2, "0")}
          </div>
        </div>

        {/* Right side: Bullets with progressive reveal */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
            flex: 1,
            justifyContent: "center",
          }}
        >
          {data.bullets.map((bullet, i) => {
            const reveal = useProgressiveReveal(
              i,
              data.bullets.length,
              durationInFrames,
              25
            );
            // Each bullet has its own subtle float after appearing
            const bulletFloat = useFloat(2, 0.02, i * 1.5);
            const numberGlow = useGlow(0.4, 0.9, 0.04, i * 2);

            return (
              <div
                key={i}
                style={{
                  ...reveal,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 20,
                  ...(reveal.isVisible ? bulletFloat : {}),
                }}
              >
                {/* Number badge */}
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: accentColor,
                    color: variant === "light" ? COLORS.white : COLORS.primary,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: FONTS.sizes.caption,
                    fontWeight: FONTS.weights.extraBold,
                    flexShrink: 0,
                    opacity: numberGlow,
                    boxShadow:
                      variant === "dark"
                        ? `0 0 ${8 + 4 * Math.sin(frame * 0.05 + i)}px rgba(231,235,0,0.2)`
                        : "0 2px 8px rgba(6,0,62,0.1)",
                  }}
                >
                  {i + 1}
                </div>

                {/* Bullet text with accent left bar */}
                <div
                  style={{
                    flex: 1,
                    borderLeft: `3px solid ${accentColor}`,
                    paddingLeft: 16,
                    borderColor:
                      reveal.isVisible
                        ? accentColor
                        : "transparent",
                    opacity: reveal.isVisible ? 0.15 + 0.85 * reveal.opacity : 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: FONTS.sizes.body,
                      fontWeight: FONTS.weights.medium,
                      lineHeight: 1.5,
                    }}
                  >
                    {bullet}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SlideLayout>
  );
};
