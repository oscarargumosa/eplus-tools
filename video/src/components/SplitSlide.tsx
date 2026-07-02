import React from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS, LAYOUT, VIDEO } from "../theme";
import type { SplitSlide as SplitSlideData } from "../types";
import { GradientShift } from "./backgrounds/GradientShift";
import { ParticleField } from "./backgrounds/ParticleField";
import { RotatingImage } from "./RotatingImage";
import {
  useFadeIn,
  useFloat,
  useProgressiveReveal,
  useUnderlineDraw,
  useGlow,
} from "./animations";
import { BANNER_HEIGHT } from "./TopBanner";

export const SplitSlide: React.FC<{ data: SplitSlideData }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const variant = data.variant ?? "dark";
  const imageRight = data.imagePosition !== "left";
  const accentColor = variant === "light" ? COLORS.primary : COLORS.accent;
  const textColor = variant === "light" ? COLORS.onSurface : COLORS.white;

  const titleAnim = useFadeIn(5);
  const textAnim = useFadeIn(20);
  const underline = useUnderlineDraw(15, 35);
  const titleFloat = useFloat(2, 0.02, 0);

  // Image zoom: starts slightly zoomed, slowly zooms more (Ken Burns)
  const imageScale = 1.05 + (frame / durationInFrames) * 0.1;
  const imageX = (frame / durationInFrames) * -15;

  const textContent = (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: LAYOUT.padding.slide,
        gap: 20,
        zIndex: 2,
      }}
    >
      {/* Title */}
      <div style={{ ...titleFloat }}>
        <h2
          style={{
            ...titleAnim,
            fontSize: FONTS.sizes.title,
            fontWeight: FONTS.weights.extraBold,
            margin: 0,
            lineHeight: 1.15,
            color: textColor,
          }}
        >
          {data.title}
        </h2>
        <div
          style={{
            height: 4,
            background: accentColor,
            borderRadius: 2,
            marginTop: 12,
            width: underline,
            maxWidth: 160,
          }}
        />
      </div>

      {/* Body text */}
      <p
        style={{
          ...textAnim,
          fontSize: FONTS.sizes.body,
          fontWeight: FONTS.weights.regular,
          lineHeight: 1.6,
          margin: 0,
          opacity: 0.85,
          color: textColor,
        }}
      >
        {data.text}
      </p>

      {/* Optional bullets */}
      {data.bullets && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
          {data.bullets.map((bullet, i) => {
            const reveal = useProgressiveReveal(i, data.bullets!.length, durationInFrames, 20);
            return (
              <div
                key={i}
                style={{
                  ...reveal,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: accentColor,
                    flexShrink: 0,
                    opacity: useGlow(0.5, 1, 0.04, i),
                  }}
                />
                <span
                  style={{
                    fontSize: FONTS.sizes.caption,
                    fontWeight: FONTS.weights.medium,
                    color: textColor,
                    opacity: 0.8,
                  }}
                >
                  {bullet}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const imageContent = (
    <div
      style={{
        flex: 1,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Image(s) with Ken Burns — rotates every ≤5s when several are given */}
      {data.images && data.images.length > 0 ? (
        <RotatingImage images={data.images} />
      ) : (
        <Img
          src={data.imageUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${imageScale}) translateX(${imageX}px)`,
          }}
        />
      )}
      {/* Gradient overlay for blending */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: imageRight
            ? `linear-gradient(to right, ${variant === "dark" ? COLORS.primary : COLORS.surface} 0%, transparent 30%)`
            : `linear-gradient(to left, ${variant === "dark" ? COLORS.primary : COLORS.surface} 0%, transparent 30%)`,
        }}
      />
      {/* Accent border */}
      <div
        style={{
          position: "absolute",
          top: 0,
          [imageRight ? "left" : "right"]: 0,
          width: 4,
          height: "100%",
          background: accentColor,
          opacity: 0.6,
        }}
      />
    </div>
  );

  return (
    <AbsoluteFill style={{ fontFamily: FONTS.family }}>
      <GradientShift variant={variant} />
      <ParticleField variant={variant} count={20} />
      <AbsoluteFill style={{ display: "flex", flexDirection: "row", zIndex: 1, paddingTop: BANNER_HEIGHT }}>
        {imageRight ? (
          <>
            {textContent}
            {imageContent}
          </>
        ) : (
          <>
            {imageContent}
            {textContent}
          </>
        )}
      </AbsoluteFill>

      {/* Bottom accent line */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 5,
          background: `linear-gradient(90deg, ${COLORS.accent}, transparent)`,
          zIndex: 3,
        }}
      />
    </AbsoluteFill>
  );
};
