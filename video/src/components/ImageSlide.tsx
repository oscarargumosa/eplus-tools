import React from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS, LAYOUT } from "../theme";
import type { ImageSlide as ImageSlideData } from "../types";
import { useFadeIn, useFloat } from "./animations";
import { RotatingImage } from "./RotatingImage";
import { BANNER_HEIGHT } from "./TopBanner";

export const ImageSlide: React.FC<{ data: ImageSlideData }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const titleAnim = useFadeIn(10);
  const captionAnim = useFadeIn(25);

  // Ken Burns: slow zoom + pan
  const scale = 1.05 + (frame / durationInFrames) * 0.12;
  const panX = (frame / durationInFrames) * -20;
  const panY = (frame / durationInFrames) * -10;

  return (
    <AbsoluteFill style={{ fontFamily: FONTS.family, paddingTop: BANNER_HEIGHT }}>
      {/* Full-bleed image(s) with Ken Burns — rotates every ≤5s when several */}
      {data.images && data.images.length > 0 ? (
        <RotatingImage images={data.images} />
      ) : (
        <Img
          src={data.imageUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale}) translate(${panX}px, ${panY}px)`,
          }}
        />
      )}

      {/* Dark gradient overlay for text readability */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to top, rgba(6,0,62,0.85) 0%, rgba(6,0,62,0.3) 40%, transparent 70%)",
        }}
      />

      {/* Vignette */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.4) 100%)",
        }}
      />

      {/* Content at bottom */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: LAYOUT.padding.slide,
          paddingBottom: 80,
          gap: 16,
          color: COLORS.white,
        }}
      >
        {data.title && (
          <h2
            style={{
              ...titleAnim,
              ...useFloat(2, 0.02, 0),
              fontSize: FONTS.sizes.title,
              fontWeight: FONTS.weights.extraBold,
              margin: 0,
              maxWidth: 900,
              textShadow: "0 2px 20px rgba(0,0,0,0.5)",
            }}
          >
            {data.title}
          </h2>
        )}

        {data.caption && (
          <p
            style={{
              ...captionAnim,
              fontSize: FONTS.sizes.body,
              fontWeight: FONTS.weights.medium,
              margin: 0,
              opacity: 0.8,
              maxWidth: 800,
              textShadow: "0 1px 10px rgba(0,0,0,0.5)",
            }}
          >
            {data.caption}
          </p>
        )}

        {/* Accent line */}
        <div
          style={{
            width: 80,
            height: 4,
            background: COLORS.accent,
            borderRadius: 2,
            marginTop: 4,
            boxShadow: `0 0 8px rgba(231,235,0,0.4)`,
            opacity: useFadeIn(18).opacity,
          }}
        />
      </AbsoluteFill>

      {/* Bottom accent bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 5,
          background: `linear-gradient(90deg, ${COLORS.accent}, transparent)`,
          zIndex: 2,
        }}
      />
    </AbsoluteFill>
  );
};
