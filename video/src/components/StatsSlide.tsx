import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS, LAYOUT } from "../theme";
import type { StatsSlide as StatsSlideData } from "../types";
import { SlideLayout } from "./SlideLayout";
import { useFadeIn, useFloat, useProgressiveReveal, useGlow } from "./animations";
import { KineticNumber } from "./KineticNumber";

export const StatsSlide: React.FC<{ data: StatsSlideData }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const variant = data.variant ?? "dark";
  const accentColor = variant === "light" ? COLORS.primary : COLORS.accent;

  const titleAnim = useFadeIn(0);

  return (
    <SlideLayout variant={variant} seed={55} imageUrl={data.imageUrl} images={data.images}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 48,
        }}
      >
        {/* Title */}
        {data.title && (
          <h2
            style={{
              ...titleAnim,
              ...useFloat(2, 0.02, 0),
              fontSize: FONTS.sizes.title,
              fontWeight: FONTS.weights.bold,
              margin: 0,
              textAlign: "center",
            }}
          >
            {data.title}
          </h2>
        )}

        {/* Stats grid */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 60,
            flexWrap: "wrap",
          }}
        >
          {data.stats.map((stat, i) => {
            const reveal = useProgressiveReveal(
              i,
              data.stats.length,
              durationInFrames,
              25
            );
            const cardFloat = useFloat(3, 0.02, i * 2);
            const glowVal = useGlow(0.5, 1, 0.04, i * 1.5);

            return (
              <div
                key={i}
                style={{
                  ...reveal,
                  ...(reveal.isVisible ? cardFloat : {}),
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                  minWidth: 200,
                }}
              >
                {/* Big number */}
                <div
                  style={{
                    fontSize: FONTS.sizes.hero + 8,
                    fontWeight: FONTS.weights.extraBold,
                    color: accentColor,
                    lineHeight: 1,
                    filter:
                      variant === "dark"
                        ? `drop-shadow(0 0 ${6 + 4 * Math.sin(frame * 0.05 + i)}px rgba(231,235,0,0.3))`
                        : "none",
                  }}
                >
                  <KineticNumber
                    value={stat.value}
                    suffix={stat.suffix || ""}
                    delay={10 + i * 15}
                    formatLocale="es-ES"
                  />
                </div>

                {/* Accent line under number */}
                <div
                  style={{
                    width: 40,
                    height: 3,
                    background: accentColor,
                    borderRadius: 2,
                    opacity: glowVal,
                  }}
                />

                {/* Label */}
                <span
                  style={{
                    fontSize: FONTS.sizes.body,
                    fontWeight: FONTS.weights.medium,
                    opacity: 0.75,
                    textAlign: "center",
                    maxWidth: 220,
                  }}
                >
                  {stat.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </SlideLayout>
  );
};
