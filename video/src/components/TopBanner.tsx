import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, FONTS, VIDEO } from "../theme";
import { useFloat } from "./animations";

interface TopBannerProps {
  title: string;          // Lesson title/hook shown in the banner
  variant?: "dark" | "light" | "accent";
}

const BANNER_HEIGHT = 72;

export const TopBanner: React.FC<TopBannerProps> = ({
  title,
  variant = "dark",
}) => {
  const frame = useCurrentFrame();
  const logoFloat = useFloat(1, 0.03, 0);

  // Subtle shimmer on the accent line at bottom of banner
  const shimmerPos = 30 + 40 * Math.sin(frame * 0.02);

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: BANNER_HEIGHT,
        background: COLORS.primary,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 40px",
        zIndex: 50,
        fontFamily: FONTS.family,
      }}
    >
      {/* Left: Logo */}
      <div
        style={{
          ...logoFloat,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        {/* Logo icon placeholder (yellow "E" badge) */}
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: COLORS.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            fontWeight: 800,
            color: COLORS.primary,
          }}
        >
          E+
        </div>
        <span
          style={{
            fontSize: 16,
            fontWeight: FONTS.weights.bold,
            color: COLORS.white,
            letterSpacing: 1.5,
            textTransform: "uppercase",
          }}
        >
          EU Funding School
        </span>
      </div>

      {/* Center/Right: Lesson title */}
      <div
        style={{
          fontSize: 20,
          fontWeight: FONTS.weights.bold,
          color: COLORS.accent,
          letterSpacing: 0.5,
          textAlign: "right",
          maxWidth: VIDEO.width * 0.55,
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}
      >
        {title}
      </div>

      {/* Bottom accent line with shimmer */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 3,
          background: `linear-gradient(90deg,
            ${COLORS.accent}00 0%,
            ${COLORS.accent} ${shimmerPos}%,
            ${COLORS.accentDim} ${shimmerPos + 20}%,
            ${COLORS.accent}00 100%)`,
        }}
      />
    </div>
  );
};

export { BANNER_HEIGHT };
