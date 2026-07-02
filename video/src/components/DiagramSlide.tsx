import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { COLORS, FONTS, LAYOUT } from "../theme";
import type { DiagramSlide as DiagramSlideData } from "../types";
import { SlideLayout } from "./SlideLayout";
import { useFadeIn, useProgressiveReveal, useFloat, useGlow } from "./animations";

export const DiagramSlide: React.FC<{ data: DiagramSlideData }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const variant = data.variant ?? "light";
  const titleAnim = useFadeIn(0);
  const accentColor = variant === "light" ? COLORS.primary : COLORS.accent;
  const cardBg = variant === "light" ? COLORS.white : "rgba(255,255,255,0.06)";
  const connectorColor = variant === "light" ? COLORS.outlineVariant : "rgba(255,255,255,0.2)";

  return (
    <SlideLayout variant={variant} seed={42} imageUrl={data.imageUrl} images={data.images}>
      <div style={{ display: "flex", flexDirection: "column", gap: 48 }}>
        {/* Title */}
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

        {/* Steps row */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            gap: 0,
          }}
        >
          {data.steps.map((step, i) => {
            const reveal = useProgressiveReveal(
              i,
              data.steps.length,
              durationInFrames,
              30
            );
            const stepFloat = useFloat(3, 0.02, i * 2);
            const numberGlow = useGlow(0.7, 1, 0.05, i * 1.5);
            const isLast = i === data.steps.length - 1;

            // Connector line draws after step appears
            const connectorProgress = interpolate(
              frame,
              [
                (i / data.steps.length) * durationInFrames * 0.75 + 20,
                (i / data.steps.length) * durationInFrames * 0.75 + 45,
              ],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );

            return (
              <React.Fragment key={i}>
                {/* Step card */}
                <div
                  style={{
                    ...reveal,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 16,
                    width: 260,
                    ...(reveal.isVisible ? stepFloat : {}),
                  }}
                >
                  {/* Number circle with glow */}
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 36,
                      background: accentColor,
                      color: variant === "light" ? COLORS.white : COLORS.primary,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: FONTS.sizes.heading,
                      fontWeight: FONTS.weights.extraBold,
                      opacity: numberGlow,
                      boxShadow: `0 0 ${10 + 6 * Math.sin(frame * 0.05 + i)}px ${
                        variant === "light"
                          ? "rgba(6,0,62,0.15)"
                          : "rgba(231,235,0,0.25)"
                      }`,
                    }}
                  >
                    {i + 1}
                  </div>

                  {/* Card with label + description */}
                  <div
                    style={{
                      background: cardBg,
                      borderRadius: LAYOUT.borderRadius.lg,
                      padding: "16px 20px",
                      textAlign: "center",
                      boxShadow:
                        variant === "light"
                          ? "0 2px 12px rgba(6,0,62,0.06)"
                          : "none",
                      border: `1px solid ${
                        variant === "light"
                          ? COLORS.outlineVariant
                          : "rgba(255,255,255,0.08)"
                      }`,
                      width: "100%",
                    }}
                  >
                    <div
                      style={{
                        fontSize: FONTS.sizes.body,
                        fontWeight: FONTS.weights.bold,
                      }}
                    >
                      {step.label}
                    </div>
                    {step.description && (
                      <div
                        style={{
                          fontSize: FONTS.sizes.caption,
                          opacity: 0.65,
                          lineHeight: 1.4,
                          marginTop: 8,
                          whiteSpace: "pre-line",
                        }}
                      >
                        {step.description}
                      </div>
                    )}
                  </div>
                </div>

                {/* Animated connector arrow */}
                {!isLast && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      paddingTop: 30,
                      opacity: connectorProgress,
                    }}
                  >
                    <div
                      style={{
                        width: 48 * connectorProgress,
                        height: 3,
                        background: connectorColor,
                        borderRadius: 2,
                      }}
                    />
                    <div
                      style={{
                        width: 0,
                        height: 0,
                        borderTop: "8px solid transparent",
                        borderBottom: "8px solid transparent",
                        borderLeft: `12px solid ${connectorColor}`,
                        opacity: connectorProgress > 0.8 ? 1 : 0,
                      }}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </SlideLayout>
  );
};
