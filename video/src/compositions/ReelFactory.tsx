import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  TransitionSeries,
  linearTiming,
} from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { fade } from "@remotion/transitions/fade";
import { noise3D } from "@remotion/noise";
import { COLORS, FONTS } from "../theme";
import { REEL } from "../reels-config";

const S = REEL.safe;

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

type SceneType =
  | "hook-text" | "hook-number" | "point" | "image-text"
  | "big-stat" | "quiz" | "reveal" | "checklist" | "cta";

interface ReelScene {
  type: SceneType;
  duration: number;
  bg?: string;
  imageUrl?: string;
  title?: string;
  subtitle?: string;
  number?: number;
  numberSuffix?: string;
  numberPrefix?: string;
  icon?: string;
  items?: string[];
  highlight?: string;
}

export interface ReelData {
  id: string;
  scenes: ReelScene[];
  musicTrack?: string;
  musicVolume?: number;
}

// ═══════════════════════════════════════════════════════════════
// Safe Content Area — wraps content within safe zones
// ═══════════════════════════════════════════════════════════════

const SafeArea: React.FC<{
  children: React.ReactNode;
  justify?: string;
  align?: string;
  gap?: number;
}> = ({ children, justify = "center", align = "center", gap = 24 }) => (
  <div
    style={{
      position: "absolute",
      top: S.top,
      left: S.left,
      width: S.contentWidth,
      height: S.contentHeight,
      display: "flex",
      flexDirection: "column",
      justifyContent: justify,
      alignItems: align,
      gap,
      zIndex: 10,
    }}
  >
    {children}
  </div>
);

// ═══════════════════════════════════════════════════════════════
// Text Pill — ensures readability on any background
// ═══════════════════════════════════════════════════════════════

const TextPill: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <div
    style={{
      background: REEL.textStyle.pillBg,
      padding: `${REEL.textStyle.pillPaddingV}px ${REEL.textStyle.pillPaddingH}px`,
      borderRadius: REEL.textStyle.pillRadius,
      ...style,
    }}
  >
    {children}
  </div>
);

// ═══════════════════════════════════════════════════════════════
// Animated Background
// ═══════════════════════════════════════════════════════════════

const AnimBg: React.FC<{ color?: string; seed?: number }> = ({
  color = COLORS.primaryContainer,
  seed = 0,
}) => {
  const frame = useCurrentFrame();
  const angle = 140 + frame * 0.25;

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `linear-gradient(${angle}deg, ${color} 0%, ${COLORS.primary} 100%)`,
        }}
      />
      {/* Perlin noise organic flow */}
      <AbsoluteFill style={{ opacity: 0.07 }}>
        {Array.from({ length: 10 }).map((_, i) =>
          Array.from({ length: 6 }).map((_, j) => {
            const n = noise3D("reel", i * 0.4 + seed, j * 0.4, frame * 0.008);
            return (
              <div
                key={`${i}-${j}`}
                style={{
                  position: "absolute",
                  left: (i / 10) * REEL.width,
                  top: (j / 6) * REEL.height,
                  width: REEL.width / 10 + 1,
                  height: REEL.height / 6 + 1,
                  background: COLORS.accent,
                  opacity: (n + 1) * 0.5,
                }}
              />
            );
          })
        )}
      </AbsoluteFill>
      {/* Floating circles */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: [100, 650, 350][i] + Math.sin(frame * 0.02 + i + seed) * 35,
            top: [250, 800, 1400][i] + Math.cos(frame * 0.015 + i * 2) * 25,
            width: [180, 130, 160][i],
            height: [180, 130, 160][i],
            borderRadius: "50%",
            border: `2px solid ${COLORS.accent}`,
            opacity: 0.06 + 0.02 * Math.sin(frame * 0.03 + i),
          }}
        />
      ))}
      {/* Audio visualizer bars at bottom (inside safe zone) */}
      <div
        style={{
          position: "absolute",
          bottom: S.bottom + 10,
          left: S.left,
          width: S.contentWidth,
          display: "flex",
          justifyContent: "center",
          gap: 3,
          height: 30,
          alignItems: "flex-end",
          opacity: 0.2,
        }}
      >
        {Array.from({ length: 30 }).map((_, i) => {
          const h = (Math.sin(frame * 0.12 + i * 0.5) * 0.5 + 0.5) * 25 + 3;
          return (
            <div
              key={i}
              style={{
                width: 3,
                height: h,
                borderRadius: 2,
                background: COLORS.accent,
              }}
            />
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════════════
// HOOK TEXT — text appears by frame 3, audio must start at 0
// ═══════════════════════════════════════════════════════════════

const HookText: React.FC<{ scene: ReelScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Text MUST appear by frame 3-5 (rule)
  const titleIn = spring({ frame: frame - REEL.timing.hookTextAppearFrame, fps, config: { damping: 14, stiffness: 90 } });
  const subIn = spring({ frame: frame - 15, fps, config: { damping: 18, stiffness: 70 } });
  const iconIn = spring({ frame, fps, config: { damping: 12, stiffness: 100 } });

  return (
    <AbsoluteFill>
      <AnimBg color={scene.bg} />
      <SafeArea>
        {scene.icon && (
          <div style={{
            fontSize: 70,
            opacity: iconIn,
            transform: `scale(${iconIn}) translateY(${Math.sin(frame * 0.05) * 5}px)`,
          }}>
            {scene.icon}
          </div>
        )}
        <TextPill>
          <h1 style={{
            opacity: titleIn,
            transform: `translateY(${interpolate(titleIn, [0, 1], [40, 0])}px)`,
            fontSize: REEL.fonts.hook.size,
            fontWeight: REEL.fonts.hook.weight,
            textAlign: "center",
            color: REEL.textStyle.color,
            lineHeight: REEL.fonts.lineHeight,
            margin: 0,
          }}>
            {scene.title}
          </h1>
        </TextPill>
        {scene.subtitle && (
          <p style={{
            opacity: subIn * 0.8,
            transform: `translateY(${interpolate(subIn, [0, 1], [20, 0])}px)`,
            fontSize: REEL.fonts.body.size,
            fontWeight: REEL.fonts.body.weight,
            textAlign: "center",
            color: COLORS.accent,
            margin: 0,
            textShadow: REEL.textStyle.shadowStroke,
          }}>
            {scene.subtitle}
          </p>
        )}
      </SafeArea>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════════════
// HOOK NUMBER — big animated counter
// ═══════════════════════════════════════════════════════════════

const HookNumber: React.FC<{ scene: ReelScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const numIn = spring({ frame: frame - REEL.timing.hookTextAppearFrame, fps, config: { damping: 12, stiffness: 60 } });
  const current = Math.round(interpolate(numIn, [0, 1], [0, scene.number || 0]));
  const formatted = new Intl.NumberFormat("es-ES").format(current);
  const glow = 15 + 12 * Math.sin(frame * 0.1);
  const labelIn = spring({ frame: frame - 20, fps, config: { damping: 18, stiffness: 70 } });

  return (
    <AbsoluteFill>
      <AnimBg color={scene.bg} />
      <SafeArea>
        {scene.title && (
          <p style={{
            fontSize: REEL.fonts.label.size,
            fontWeight: REEL.fonts.label.weight,
            color: COLORS.white,
            opacity: 0.6,
            margin: 0,
            textAlign: "center",
            textShadow: REEL.textStyle.shadowStroke,
          }}>
            {scene.title}
          </p>
        )}
        <div style={{
          fontSize: 100,
          fontWeight: 800,
          color: COLORS.accent,
          textAlign: "center",
          filter: `drop-shadow(0 0 ${glow}px rgba(231,235,0,0.4))`,
          transform: `scale(${0.85 + numIn * 0.15}) translateY(${Math.sin(frame * 0.03) * 4}px)`,
          lineHeight: 1,
        }}>
          {scene.numberPrefix || ""}{formatted}{scene.numberSuffix || ""}
        </div>
        {scene.subtitle && (
          <TextPill style={{ marginTop: 8 }}>
            <p style={{
              fontSize: REEL.fonts.body.size,
              fontWeight: 700,
              color: COLORS.white,
              margin: 0,
              textAlign: "center",
              opacity: labelIn,
            }}>
              {scene.subtitle}
            </p>
          </TextPill>
        )}
      </SafeArea>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════════════
// POINT — numbered point with icon
// ═══════════════════════════════════════════════════════════════

const PointScene: React.FC<{ scene: ReelScene; index: number }> = ({ scene, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const numIn = spring({ frame: frame - REEL.timing.hookTextAppearFrame, fps, config: { damping: 12, stiffness: 100 } });
  const textIn = spring({ frame: frame - 12, fps, config: { damping: 16, stiffness: 70 } });
  const glow = 8 + 6 * Math.sin(frame * 0.1);
  const accentColor = scene.highlight || COLORS.accent;

  return (
    <AbsoluteFill>
      <AnimBg color={scene.bg} seed={index} />
      <SafeArea>
        <div style={{
          opacity: numIn,
          transform: `scale(${numIn}) translateY(${Math.sin(frame * 0.04) * 5}px)`,
          width: 90, height: 90, borderRadius: 45,
          background: accentColor,
          color: COLORS.primary,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 44, fontWeight: 800,
          boxShadow: `0 0 ${glow}px ${accentColor}`,
        }}>
          {scene.icon || (index + 1)}
        </div>
        <TextPill>
          <h2 style={{
            opacity: textIn,
            transform: `translateY(${interpolate(textIn, [0, 1], [25, 0])}px)`,
            fontSize: REEL.fonts.title.size,
            fontWeight: REEL.fonts.title.weight,
            textAlign: "center", color: COLORS.white,
            margin: 0, lineHeight: REEL.fonts.lineHeight,
          }}>
            {scene.title}
          </h2>
        </TextPill>
        {scene.subtitle && (
          <p style={{
            opacity: textIn * 0.7,
            fontSize: REEL.fonts.body.size,
            fontWeight: REEL.fonts.body.weight,
            textAlign: "center", color: COLORS.white, margin: 0,
            textShadow: REEL.textStyle.shadowStroke,
          }}>
            {scene.subtitle}
          </p>
        )}
      </SafeArea>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════════════
// IMAGE TEXT — full-bleed image with text in safe zone
// ═══════════════════════════════════════════════════════════════

const ImageText: React.FC<{ scene: ReelScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const textIn = spring({ frame: frame - REEL.timing.hookTextAppearFrame, fps, config: { damping: 16, stiffness: 70 } });
  const scale = 1.05 + (frame / durationInFrames) * 0.1;

  return (
    <AbsoluteFill>
      {scene.imageUrl && (
        <>
          <Img src={scene.imageUrl} style={{
            width: "100%", height: "100%", objectFit: "cover",
            transform: `scale(${scale})`,
          }} />
          <AbsoluteFill style={{
            background: "linear-gradient(to top, rgba(6,0,62,0.92) 0%, rgba(6,0,62,0.5) 35%, rgba(6,0,62,0.15) 65%, rgba(6,0,62,0.4) 100%)",
          }} />
        </>
      )}
      {/* Text positioned within safe zone, lower third */}
      <div style={{
        position: "absolute",
        bottom: S.bottom + 40,
        left: S.left,
        width: S.contentWidth,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        zIndex: 10,
      }}>
        <TextPill>
          <h2 style={{
            opacity: textIn,
            transform: `translateY(${interpolate(textIn, [0, 1], [25, 0])}px)`,
            fontSize: REEL.fonts.title.size,
            fontWeight: REEL.fonts.title.weight,
            color: COLORS.white, margin: 0,
            lineHeight: REEL.fonts.lineHeight,
          }}>
            {scene.title}
          </h2>
        </TextPill>
        {scene.subtitle && (
          <p style={{
            opacity: textIn * 0.8,
            fontSize: REEL.fonts.body.size,
            fontWeight: 600,
            color: COLORS.accent, margin: 0,
            textShadow: REEL.textStyle.shadowStroke,
          }}>
            {scene.subtitle}
          </p>
        )}
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════════════
// BIG STAT — massive number with context
// ═══════════════════════════════════════════════════════════════

const BigStat: React.FC<{ scene: ReelScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const numIn = spring({ frame: frame - REEL.timing.hookTextAppearFrame, fps, config: { damping: 10, stiffness: 50 } });
  const current = Math.round(interpolate(numIn, [0, 1], [0, scene.number || 0]));
  const formatted = new Intl.NumberFormat("es-ES").format(current);
  const glow = 20 + 15 * Math.sin(frame * 0.08);

  return (
    <AbsoluteFill>
      <AnimBg color={scene.bg} seed={99} />
      <SafeArea>
        <div style={{
          fontSize: 120,
          fontWeight: 800,
          color: COLORS.accent,
          filter: `drop-shadow(0 0 ${glow}px rgba(231,235,0,0.5))`,
          transform: `translateY(${Math.sin(frame * 0.03) * 4}px)`,
          lineHeight: 1,
          textAlign: "center",
        }}>
          {scene.numberPrefix || ""}{formatted}{scene.numberSuffix || ""}
        </div>
        <div style={{ width: 80, height: 5, background: COLORS.accent, borderRadius: 3 }} />
        <TextPill>
          <h2 style={{
            fontSize: REEL.fonts.body.size + 4,
            fontWeight: 700,
            color: COLORS.white,
            textAlign: "center",
            margin: 0,
            opacity: numIn,
            lineHeight: REEL.fonts.lineHeight,
          }}>
            {scene.title}
          </h2>
        </TextPill>
        {scene.subtitle && (
          <p style={{
            fontSize: REEL.fonts.label.size,
            color: COLORS.white,
            textAlign: "center",
            margin: 0,
            opacity: 0.5,
            textShadow: REEL.textStyle.shadowStroke,
          }}>
            {scene.subtitle}
          </p>
        )}
      </SafeArea>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════════════
// QUIZ — question with emoji, builds curiosity
// ═══════════════════════════════════════════════════════════════

const QuizScene: React.FC<{ scene: ReelScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const qIn = spring({ frame: frame - REEL.timing.hookTextAppearFrame, fps, config: { damping: 16, stiffness: 80 } });
  const pulse = Math.sin(frame * 0.08) * 6;

  return (
    <AbsoluteFill>
      <AnimBg color="#1a0a3e" seed={77} />
      <SafeArea>
        <div style={{
          fontSize: 70, opacity: qIn,
          transform: `scale(${qIn}) translateY(${pulse}px)`,
        }}>
          🤔
        </div>
        <TextPill>
          <h2 style={{
            opacity: qIn,
            transform: `translateY(${interpolate(qIn, [0, 1], [30, 0])}px)`,
            fontSize: REEL.fonts.title.size + 4,
            fontWeight: REEL.fonts.title.weight,
            color: COLORS.white,
            textAlign: "center", margin: 0,
            lineHeight: REEL.fonts.lineHeight,
          }}>
            {scene.title}
          </h2>
        </TextPill>
        {scene.subtitle && (
          <div style={{
            opacity: qIn * 0.5,
            fontSize: REEL.fonts.body.size,
            color: COLORS.accent,
            textAlign: "center",
            textShadow: REEL.textStyle.shadowStroke,
          }}>
            {scene.subtitle}
          </div>
        )}
      </SafeArea>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════════════
// REVEAL — answer/surprise after quiz
// ═══════════════════════════════════════════════════════════════

const RevealScene: React.FC<{ scene: ReelScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const revealIn = spring({ frame: frame - 8, fps, config: { damping: 12, stiffness: 80 } });
  const glow = 12 + 10 * Math.sin(frame * 0.1);

  return (
    <AbsoluteFill>
      <AnimBg color={scene.bg || "#0d2137"} seed={33} />
      <SafeArea>
        <div style={{ fontSize: 55, opacity: revealIn }}>💡</div>
        <TextPill>
          <h2 style={{
            opacity: revealIn,
            transform: `scale(${0.85 + revealIn * 0.15})`,
            fontSize: REEL.fonts.title.size,
            fontWeight: REEL.fonts.title.weight,
            color: COLORS.accent,
            textAlign: "center", margin: 0,
            lineHeight: REEL.fonts.lineHeight,
            filter: `drop-shadow(0 0 ${glow}px rgba(231,235,0,0.3))`,
          }}>
            {scene.title}
          </h2>
        </TextPill>
        {scene.subtitle && (
          <p style={{
            opacity: revealIn * 0.8,
            fontSize: REEL.fonts.body.size,
            fontWeight: 600,
            color: COLORS.white,
            textAlign: "center", margin: 0,
            textShadow: REEL.textStyle.shadowStroke,
          }}>
            {scene.subtitle}
          </p>
        )}
      </SafeArea>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════════════
// CHECKLIST — items appear progressively across duration
// ═══════════════════════════════════════════════════════════════

const ChecklistScene: React.FC<{ scene: ReelScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const titleIn = spring({ frame: frame - REEL.timing.hookTextAppearFrame, fps, config: { damping: 16, stiffness: 80 } });
  const items = scene.items || [];

  return (
    <AbsoluteFill>
      <AnimBg color={scene.bg || "#1b1464"} seed={55} />
      <SafeArea gap={18}>
        {scene.title && (
          <TextPill style={{ marginBottom: 8 }}>
            <h2 style={{
              opacity: titleIn,
              fontSize: REEL.fonts.body.size + 4,
              fontWeight: 800,
              color: COLORS.white,
              textAlign: "center", margin: 0,
            }}>
              {scene.title}
            </h2>
          </TextPill>
        )}
        {items.map((item, i) => {
          // Progressive reveal across 75% of slide duration
          const itemStart = (i / items.length) * (durationInFrames * 0.7) + 15;
          const itemIn = spring({ frame: frame - itemStart, fps, config: { damping: 14, stiffness: 90 } });
          const checkGlow = 6 + 4 * Math.sin(frame * 0.06 + i);
          return (
            <div key={i} style={{
              opacity: itemIn,
              transform: `translateX(${interpolate(itemIn, [0, 1], [-30, 0])}px)`,
              display: "flex", alignItems: "center", gap: 14,
              width: "100%",
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 20,
                background: COLORS.accent, color: COLORS.primary,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, fontWeight: 800, flexShrink: 0,
                boxShadow: `0 0 ${checkGlow}px rgba(231,235,0,0.3)`,
              }}>
                ✓
              </div>
              <TextPill style={{ flex: 1 }}>
                <span style={{
                  fontSize: REEL.fonts.label.size,
                  fontWeight: 600,
                  color: COLORS.white,
                }}>
                  {item}
                </span>
              </TextPill>
            </div>
          );
        })}
      </SafeArea>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════════════
// CTA — final screen, ONE action, glow button, social proof
// ═══════════════════════════════════════════════════════════════

const CTAScene: React.FC<{ scene: ReelScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoIn = spring({ frame: frame - REEL.timing.hookTextAppearFrame, fps, config: { damping: 15, stiffness: 80 } });
  const ctaIn = spring({ frame: frame - 15, fps, config: { damping: 16, stiffness: 70 } });
  const glow = 14 + 10 * Math.sin(frame * 0.12);

  return (
    <AbsoluteFill>
      <AnimBg color={scene.bg || COLORS.primaryContainer} seed={88} />
      {/* Rings */}
      {[0, 1].map((i) => (
        <div key={i} style={{
          position: "absolute", top: "50%", left: "50%",
          width: 300, height: 300, borderRadius: "50%",
          border: `2px solid ${COLORS.accent}`,
          transform: `translate(-50%, -50%) scale(${interpolate(frame, [0, 120], [0.4 + i * 0.2, 1.5 + i * 0.3], { extrapolateRight: "clamp" })})`,
          opacity: 0.05,
        }} />
      ))}
      <SafeArea>
        {/* Logo badge */}
        <div style={{
          opacity: logoIn,
          transform: `scale(${logoIn}) translateY(${Math.sin(frame * 0.03) * 4}px)`,
          background: COLORS.accent, color: COLORS.primary,
          padding: "10px 28px", borderRadius: 14,
          fontSize: REEL.fonts.label.size, fontWeight: 800, letterSpacing: 2,
        }}>
          EU FUNDING SCHOOL
        </div>

        <div style={{ width: 80, height: 4, background: COLORS.accent, borderRadius: 2, opacity: logoIn }} />

        {/* CTA text */}
        <TextPill>
          <h2 style={{
            opacity: ctaIn,
            fontSize: REEL.fonts.body.size + 6,
            fontWeight: 800,
            color: COLORS.white,
            textAlign: "center", margin: 0,
            lineHeight: REEL.fonts.lineHeight,
          }}>
            {scene.title || "Aprende a conseguir\nfinanciación europea"}
          </h2>
        </TextPill>

        {/* CTA Button — positioned in upper 60% of screen (rule) */}
        <div style={{
          opacity: ctaIn,
          transform: `translateY(${Math.sin(frame * 0.04) * 4}px)`,
          background: COLORS.accent, color: COLORS.primary,
          padding: "18px 48px", borderRadius: 26,
          fontSize: REEL.fonts.body.size, fontWeight: 800,
          boxShadow: `0 0 ${glow}px ${COLORS.accent}, 0 0 ${glow * 2}px rgba(231,235,0,0.15)`,
        }}>
          {scene.subtitle || "eufundingschool.com"}
        </div>

        {/* Social proof */}
        <p style={{
          opacity: ctaIn * 0.5,
          fontSize: REEL.fonts.label.size - 2,
          color: COLORS.white, margin: 0,
          textShadow: REEL.textStyle.shadowStroke,
        }}>
          +2.400 coordinadores ya están dentro
        </p>
      </SafeArea>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════════════
// Scene Router + Transitions
// ═══════════════════════════════════════════════════════════════

const renderScene = (scene: ReelScene, index: number) => {
  switch (scene.type) {
    case "hook-text": return <HookText scene={scene} />;
    case "hook-number": return <HookNumber scene={scene} />;
    case "point": return <PointScene scene={scene} index={index} />;
    case "image-text": return <ImageText scene={scene} />;
    case "big-stat": return <BigStat scene={scene} />;
    case "quiz": return <QuizScene scene={scene} />;
    case "reveal": return <RevealScene scene={scene} />;
    case "checklist": return <ChecklistScene scene={scene} />;
    case "cta": return <CTAScene scene={scene} />;
    default: return null;
  }
};

const TRANSITIONS = [
  () => wipe({ direction: "from-bottom" }),
  () => slide({ direction: "from-right" }),
  () => fade(),
  () => wipe({ direction: "from-left" }),
  () => slide({ direction: "from-bottom" }),
];

// ═══════════════════════════════════════════════════════════════
// Main Composition
// ═══════════════════════════════════════════════════════════════

export const ReelFactory: React.FC<{ data: ReelData }> = ({ data }) => {
  const { fps } = useVideoConfig();
  const TRANS = REEL.timing.transitionFrames;

  return (
    <AbsoluteFill style={{ fontFamily: FONTS.family, background: COLORS.primary }}>
      {data.musicTrack && (
        <Audio
          src={staticFile(`audio/${data.musicTrack}`)}
          volume={data.musicVolume ?? REEL.audio.musicOnly}
        />
      )}

      <TransitionSeries>
        {data.scenes.map((scene, i) => {
          const dur = Math.round(scene.duration * fps);
          const transFn = TRANSITIONS[i % TRANSITIONS.length];
          return (
            <React.Fragment key={i}>
              <TransitionSeries.Sequence durationInFrames={dur}>
                {renderScene(scene, i)}
              </TransitionSeries.Sequence>
              {i < data.scenes.length - 1 && (
                <TransitionSeries.Transition
                  presentation={transFn()}
                  timing={linearTiming({ durationInFrames: TRANS })}
                />
              )}
            </React.Fragment>
          );
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};

export function calculateReelFrames(data: ReelData, fps: number): number {
  const total = data.scenes.reduce((sum, s) => sum + Math.round(s.duration * fps), 0);
  return total - (data.scenes.length - 1) * REEL.timing.transitionFrames;
}
