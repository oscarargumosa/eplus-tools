import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, VIDEO } from "../../theme";

interface Particle {
  x: number;
  y: number;
  radius: number;
  speed: number;
  angle: number;
  opacity: number;
  phase: number;
}

interface ParticleFieldProps {
  count?: number;
  color?: string;
  variant?: "light" | "dark" | "accent";
}

// Seeded pseudo-random for deterministic particles
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

export const ParticleField: React.FC<ParticleFieldProps> = ({
  count = 35,
  color,
  variant = "dark",
}) => {
  const frame = useCurrentFrame();

  const particleColor =
    color ??
    (variant === "light"
      ? COLORS.primary
      : variant === "accent"
        ? COLORS.accent
        : COLORS.accent);

  // Generate particles once (deterministic)
  const particles = useMemo<Particle[]>(() => {
    const rand = seededRandom(42);
    return Array.from({ length: count }, () => ({
      x: rand() * VIDEO.width,
      y: rand() * VIDEO.height,
      radius: 1.5 + rand() * 3,
      speed: 0.15 + rand() * 0.4,
      angle: rand() * Math.PI * 2,
      opacity: 0.04 + rand() * 0.12,
      phase: rand() * Math.PI * 2,
    }));
  }, [count]);

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <svg width={VIDEO.width} height={VIDEO.height}>
        {particles.map((p, i) => {
          // Slow drifting motion
          const t = frame * p.speed;
          const x =
            (p.x + Math.cos(p.angle) * t + Math.sin(p.phase + frame * 0.01) * 20) %
            VIDEO.width;
          const y =
            (p.y + Math.sin(p.angle) * t + Math.cos(p.phase + frame * 0.008) * 15) %
            VIDEO.height;

          // Gentle pulsing opacity
          const pulseOpacity =
            p.opacity * (0.7 + 0.3 * Math.sin(frame * 0.03 + p.phase));

          return (
            <circle
              key={i}
              cx={((x % VIDEO.width) + VIDEO.width) % VIDEO.width}
              cy={((y % VIDEO.height) + VIDEO.height) % VIDEO.height}
              r={p.radius}
              fill={particleColor}
              opacity={pulseOpacity}
            />
          );
        })}

        {/* Subtle connecting lines between nearby particles */}
        {particles.slice(0, 12).map((p1, i) => {
          const t = frame * p1.speed;
          const x1 =
            ((p1.x + Math.cos(p1.angle) * t + Math.sin(p1.phase + frame * 0.01) * 20) %
              VIDEO.width +
              VIDEO.width) %
            VIDEO.width;
          const y1 =
            ((p1.y + Math.sin(p1.angle) * t + Math.cos(p1.phase + frame * 0.008) * 15) %
              VIDEO.height +
              VIDEO.height) %
            VIDEO.height;

          return particles.slice(i + 1, i + 4).map((p2, j) => {
            const t2 = frame * p2.speed;
            const x2 =
              ((p2.x + Math.cos(p2.angle) * t2 + Math.sin(p2.phase + frame * 0.01) * 20) %
                VIDEO.width +
                VIDEO.width) %
              VIDEO.width;
            const y2 =
              ((p2.y + Math.sin(p2.angle) * t2 + Math.cos(p2.phase + frame * 0.008) * 15) %
                VIDEO.height +
                VIDEO.height) %
              VIDEO.height;

            const dist = Math.hypot(x2 - x1, y2 - y1);
            if (dist > 300) return null;

            const lineOpacity = (1 - dist / 300) * 0.06;
            return (
              <line
                key={`${i}-${j}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={particleColor}
                strokeWidth={0.5}
                opacity={lineOpacity}
              />
            );
          });
        })}
      </svg>
    </AbsoluteFill>
  );
};
