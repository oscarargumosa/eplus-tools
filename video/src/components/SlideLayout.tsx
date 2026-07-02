import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COLORS, FONTS, LAYOUT } from "../theme";
import type { SlideVariant } from "../types";
import { ParticleField } from "./backgrounds/ParticleField";
import { GradientShift } from "./backgrounds/GradientShift";
import { NoiseBackground } from "./backgrounds/NoiseBackground";
import { DecorativeShapes } from "./DecorativeShapes";
import { AudioVisualizer } from "./AudioVisualizer";
import { RotatingImage } from "./RotatingImage";
import { BANNER_HEIGHT } from "./TopBanner";

interface SlideLayoutProps {
  variant?: SlideVariant;
  children: React.ReactNode;
  showWatermark?: boolean;
  showParticles?: boolean;
  showDecorations?: boolean;
  showNoise?: boolean;
  showVisualizer?: boolean;
  seed?: number;
  /** Single background photo (Ken Burns). */
  imageUrl?: string;
  /** Multiple background photos that rotate (≤5s each) behind the content. */
  images?: string[];
}

export const SlideLayout: React.FC<SlideLayoutProps> = ({
  variant = "dark",
  children,
  showWatermark = true,
  showParticles = true,
  showDecorations = true,
  showNoise = true,
  showVisualizer = true,
  seed = 0,
  imageUrl,
  images,
}) => {
  const frame = useCurrentFrame();
  const textColor = variant === "light" ? COLORS.onSurface : COLORS.white;

  const bgImages =
    images && images.length > 0 ? images : imageUrl ? [imageUrl] : null;

  return (
    <AbsoluteFill style={{ fontFamily: FONTS.family, color: textColor }}>
      {/* Layer 1: background — rotating photos (if provided) or animated gradient */}
      {bgImages ? (
        <>
          <RotatingImage images={bgImages} />
          {/* Brand-tinted scrim for text legibility */}
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(180deg, rgba(6,0,62,0.74) 0%, rgba(6,0,62,0.58) 45%, rgba(6,0,62,0.78) 100%)",
            }}
          />
          {/* Vignette */}
          <AbsoluteFill
            style={{
              background:
                "radial-gradient(ellipse at center, transparent 32%, rgba(0,0,0,0.45) 100%)",
            }}
          />
        </>
      ) : (
        <GradientShift variant={variant} />
      )}

      {/* Layer 2: Perlin noise organic flow */}
      {showNoise && <NoiseBackground variant={variant} opacity={0.08} />}

      {/* Layer 3: Particles */}
      {showParticles && <ParticleField variant={variant} />}

      {/* Layer 4: Decorative shapes */}
      {showDecorations && <DecorativeShapes variant={variant} seed={seed} />}

      {/* Layer 5: Audio visualizer bars at bottom */}
      {showVisualizer && (
        <AudioVisualizer
          color={variant === "light" ? COLORS.primary : COLORS.accent}
          opacity={0.15}
          maxHeight={40}
          position="bottom"
        />
      )}

      {/* Layer 6: Content (below banner) */}
      <AbsoluteFill
        style={{
          paddingTop: BANNER_HEIGHT + 20,
          paddingLeft: LAYOUT.padding.slide,
          paddingRight: LAYOUT.padding.slide,
          paddingBottom: LAYOUT.padding.slide,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          zIndex: 1,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          {children}
        </div>

        {/* Bottom accent line with shimmer */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 5,
            background: `linear-gradient(90deg,
              transparent 0%,
              ${COLORS.accent} ${20 + 10 * Math.sin(frame * 0.03)}%,
              ${COLORS.accentDim} 60%,
              transparent 100%)`,
          }}
        />

        {showWatermark && (
          <div
            style={{
              position: "absolute",
              bottom: 16,
              left: LAYOUT.padding.slide,
              fontSize: FONTS.sizes.small - 2,
              opacity: 0.3,
              fontWeight: FONTS.weights.medium,
              letterSpacing: 1,
              color: variant === "light" ? COLORS.outline : COLORS.outlineVariant,
            }}
          >
            eufundingschool.com
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
