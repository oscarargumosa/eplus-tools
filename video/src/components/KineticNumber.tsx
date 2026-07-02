import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

interface KineticNumberProps {
  value: number;
  prefix?: string;      // e.g. "" or "+"
  suffix?: string;      // e.g. "€", "%", "M€"
  delay?: number;       // frames before starting
  style?: React.CSSProperties;
  formatLocale?: string;
}

export const KineticNumber: React.FC<KineticNumberProps> = ({
  value,
  prefix = "",
  suffix = "",
  delay = 0,
  style = {},
  formatLocale = "es-ES",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 30, stiffness: 40 },
  });

  const currentValue = Math.round(interpolate(progress, [0, 1], [0, value]));

  const formatted = new Intl.NumberFormat(formatLocale).format(currentValue);

  // Scale punch on arrival
  const scalePunch =
    progress > 0.95
      ? interpolate(progress, [0.95, 1], [1.05, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : interpolate(progress, [0, 0.95], [0.8, 1.05], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

  return (
    <span
      style={{
        display: "inline-block",
        transform: `scale(${scalePunch})`,
        fontVariantNumeric: "tabular-nums",
        ...style,
      }}
    >
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
};
