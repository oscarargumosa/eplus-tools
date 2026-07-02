import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { COLORS, FONTS, LAYOUT } from "../theme";
import type { HighlightSlide as HighlightSlideData } from "../types";
import { SlideLayout } from "./SlideLayout";
import { useFadeIn, useScaleIn, useFloat, useGlow } from "./animations";
import { KineticNumber } from "./KineticNumber";

// Parse text to find numbers and replace with KineticNumber components
function renderTextWithKineticNumbers(
  text: string,
  baseDelay: number
): React.ReactNode[] {
  const regex = /(\d[\d.]*)\s*(millones|M)?(\s*de)?\s*(€|euros|%)?/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let matchIndex = 0;

  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const numStr = match[1].replace(/\./g, "");
    const num = parseInt(numStr, 10);
    const isMillions = match[2] === "millones" || match[2] === "M";
    const suffix = match[4] === "%" ? "%" : match[4] === "€" || match[4] === "euros" ? "€" : "";
    const fullSuffix = isMillions ? `M${suffix}` : suffix;

    parts.push(
      <KineticNumber
        key={`num-${matchIndex}`}
        value={num}
        suffix={fullSuffix}
        delay={baseDelay + matchIndex * 8}
        style={{ fontWeight: 800, color: COLORS.accent }}
        formatLocale="es-ES"
      />
    );

    matchIndex++;
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  if (parts.length === 0) {
    return [text];
  }

  return parts;
}

export const HighlightSlide: React.FC<{ data: HighlightSlideData }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const variant = data.variant ?? "accent";

  const iconAnim = useScaleIn(0);
  const textAnim = useFadeIn(15);
  const sourceAnim = useFadeIn(40);
  const iconFloat = useFloat(4, 0.03, 0);
  const textFloat = useFloat(2, 0.02, 1);

  // Decorative expanding circle
  const circleScale = interpolate(frame, [0, durationInFrames], [0.5, 1.2], {
    extrapolateRight: "clamp",
  });

  // Side accent bars that pulse
  const barHeight = 120 + 40 * Math.sin(frame * 0.03);
  const barGlow = useGlow(0.05, 0.15, 0.04, 0);

  const lines = data.text.split("\n");

  return (
    <SlideLayout variant={variant} seed={99} imageUrl={data.imageUrl} images={data.images}>
      {/* Expanding ring */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: 500,
          height: 500,
          borderRadius: "50%",
          border: `1.5px solid ${COLORS.accent}`,
          transform: `translate(-50%, -50%) scale(${circleScale})`,
          opacity: 0.05,
          pointerEvents: "none",
        }}
      />

      {/* Left accent bar */}
      <div
        style={{
          position: "absolute",
          left: 40,
          top: "50%",
          width: 4,
          height: barHeight,
          borderRadius: 2,
          background: COLORS.accent,
          transform: "translateY(-50%)",
          opacity: barGlow,
        }}
      />

      {/* Right accent bar */}
      <div
        style={{
          position: "absolute",
          right: 40,
          top: "50%",
          width: 4,
          height: barHeight * 0.7,
          borderRadius: 2,
          background: COLORS.accent,
          transform: "translateY(-50%)",
          opacity: barGlow * 0.6,
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 28,
        }}
      >
        {/* Icon with float */}
        <div style={{ ...iconFloat }}>
          <div
            style={{
              ...iconAnim,
              fontSize: 72,
              lineHeight: 1,
              color: COLORS.accent,
            }}
          >
            {data.icon ? (
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: 72,
                  filter: `drop-shadow(0 0 ${6 + 4 * Math.sin(frame * 0.06)}px rgba(231,235,0,0.4))`,
                }}
              >
                {data.icon}
              </span>
            ) : (
              "\u201C"
            )}
          </div>
        </div>

        {/* Text lines with kinetic numbers */}
        <div style={{ ...textAnim, ...textFloat }}>
          {lines.map((line, i) => (
            <p
              key={i}
              style={{
                fontSize: i === 0 ? FONTS.sizes.subtitle + 4 : FONTS.sizes.body + 2,
                fontWeight: i === 0 ? FONTS.weights.bold : FONTS.weights.semiBold,
                lineHeight: 1.5,
                margin: "6px 0",
                maxWidth: 1100,
                opacity: i === 0 ? 1 : 0.8,
              }}
            >
              {renderTextWithKineticNumbers(line, 20 + i * 10)}
            </p>
          ))}
        </div>

        {/* Source */}
        {data.source && (
          <p
            style={{
              ...sourceAnim,
              ...useFloat(1.5, 0.015, 3),
              fontSize: FONTS.sizes.caption,
              fontWeight: FONTS.weights.medium,
              opacity: sourceAnim.opacity * 0.45,
              margin: 0,
              letterSpacing: 0.5,
            }}
          >
            — {data.source}
          </p>
        )}
      </div>
    </SlideLayout>
  );
};
