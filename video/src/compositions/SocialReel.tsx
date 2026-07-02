import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
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
import { COLORS, FONTS } from "../theme";

const W = 1080;
const H = 1920;
const FPS = 30;
const PHASE_DURATION = 4 * FPS; // 4 seconds per phase
const TRANSITION_FRAMES = 12;

interface ReelPhase {
  number: number;
  title: string;
  subtitle: string;
  color: string;
  imageUrl: string;
  icon: string;
}

interface SocialReelProps {
  hook: string;
  phases: ReelPhase[];
  cta: string;
  ctaSub: string;
  musicTrack?: string;
}

// ── Animated background ──────────────────────────────────────
const AnimatedBg: React.FC<{ color: string }> = ({ color }) => {
  const frame = useCurrentFrame();
  const angle = 135 + frame * 0.3;
  const pulse = 0.03 * Math.sin(frame * 0.04);

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `linear-gradient(${angle}deg, ${color} 0%, ${COLORS.primary} 100%)`,
        }}
      />
      {/* Floating circles */}
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: [100, 700, 300, 850, 500][i] + Math.sin(frame * 0.02 + i) * 40,
            top: [200, 600, 1200, 400, 1500][i] + Math.cos(frame * 0.015 + i * 2) * 30,
            width: [180, 120, 200, 90, 150][i],
            height: [180, 120, 200, 90, 150][i],
            borderRadius: "50%",
            border: `2px solid ${COLORS.accent}`,
            opacity: 0.06 + 0.03 * Math.sin(frame * 0.03 + i),
            transform: `scale(${1 + pulse})`,
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

// ── Hook slide (first) ───────────────────────────────────────
const HookSlide: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleIn = spring({ frame, fps, config: { damping: 18, stiffness: 80 } });
  const lineWidth = interpolate(frame, [15, 45], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const logoIn = spring({ frame: frame - 20, fps, config: { damping: 20, stiffness: 60 } });
  const float = Math.sin(frame * 0.03) * 5;

  return (
    <AbsoluteFill>
      <AnimatedBg color={COLORS.primaryContainer} />
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 60,
          gap: 30,
        }}
      >
        {/* Logo */}
        <div
          style={{
            opacity: logoIn,
            transform: `scale(${logoIn}) translateY(${float}px)`,
            background: COLORS.accent,
            color: COLORS.primary,
            padding: "14px 36px",
            borderRadius: 20,
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: 2,
          }}
        >
          EU FUNDING SCHOOL
        </div>

        {/* Hook text */}
        <h1
          style={{
            opacity: titleIn,
            transform: `translateY(${interpolate(titleIn, [0, 1], [40, 0])}px)`,
            fontSize: 72,
            fontWeight: 800,
            textAlign: "center",
            color: COLORS.white,
            lineHeight: 1.15,
            margin: 0,
            maxWidth: 900,
          }}
        >
          {text}
        </h1>

        {/* Accent line */}
        <div
          style={{
            width: `${lineWidth}%`,
            maxWidth: 200,
            height: 6,
            background: COLORS.accent,
            borderRadius: 3,
            boxShadow: `0 0 15px ${COLORS.accent}`,
          }}
        />

        {/* Swipe hint */}
        <div
          style={{
            opacity: interpolate(frame, [60, 80], [0, 0.6], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            transform: `translateY(${Math.sin(frame * 0.08) * 8}px)`,
            fontSize: 22,
            color: COLORS.accent,
            fontWeight: 600,
            marginTop: 40,
          }}
        >
          ▼ Descubre las 3 líneas ▼
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── Phase slide ──────────────────────────────────────────────
const PhaseSlide: React.FC<{ phase: ReelPhase }> = ({ phase }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const numberIn = spring({ frame, fps, config: { damping: 12, stiffness: 100 } });
  const titleIn = spring({ frame: frame - 8, fps, config: { damping: 18, stiffness: 70 } });
  const subtitleIn = spring({ frame: frame - 18, fps, config: { damping: 20, stiffness: 60 } });
  const imageIn = spring({ frame: frame - 5, fps, config: { damping: 25, stiffness: 50 } });

  const imageScale = 1.05 + (frame / durationInFrames) * 0.1;
  const float = Math.sin(frame * 0.025) * 4;
  const numberGlow = 10 + 8 * Math.sin(frame * 0.1);

  return (
    <AbsoluteFill>
      <AnimatedBg color={phase.color} />

      {/* Image top half with Ken Burns */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: H * 0.45,
          overflow: "hidden",
          opacity: imageIn,
        }}
      >
        <Img
          src={phase.imageUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${imageScale})`,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(to bottom, transparent 40%, ${phase.color} 100%)`,
          }}
        />
      </div>

      {/* Content bottom */}
      <AbsoluteFill
        style={{
          top: H * 0.38,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "0 60px",
          gap: 20,
        }}
      >
        {/* Big number */}
        <div
          style={{
            opacity: numberIn,
            transform: `scale(${numberIn}) translateY(${float}px)`,
            width: 120,
            height: 120,
            borderRadius: 60,
            background: COLORS.accent,
            color: COLORS.primary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 56,
            fontWeight: 800,
            boxShadow: `0 0 ${numberGlow}px ${COLORS.accent}, 0 4px 20px rgba(0,0,0,0.3)`,
          }}
        >
          {phase.number}
        </div>

        {/* Title */}
        <h2
          style={{
            opacity: titleIn,
            transform: `translateY(${interpolate(titleIn, [0, 1], [30, float])}px)`,
            fontSize: 58,
            fontWeight: 800,
            textAlign: "center",
            color: COLORS.white,
            margin: 0,
            lineHeight: 1.15,
          }}
        >
          {phase.title}
        </h2>

        {/* Accent line */}
        <div
          style={{
            width: 80,
            height: 5,
            background: COLORS.accent,
            borderRadius: 3,
            opacity: titleIn,
            boxShadow: `0 0 8px rgba(231,235,0,0.4)`,
          }}
        />

        {/* Subtitle */}
        <p
          style={{
            opacity: subtitleIn,
            transform: `translateY(${interpolate(subtitleIn, [0, 1], [20, 0])}px)`,
            fontSize: 32,
            fontWeight: 500,
            textAlign: "center",
            color: COLORS.white,
            margin: 0,
            lineHeight: 1.4,
            maxWidth: 850,
            opacity: subtitleIn * 0.8,
          }}
        >
          {phase.subtitle}
        </p>

        {/* Phase icon / emoji indicator */}
        <div
          style={{
            opacity: subtitleIn,
            fontSize: 50,
            marginTop: 10,
            transform: `translateY(${Math.sin(frame * 0.06) * 6}px)`,
          }}
        >
          {phase.icon}
        </div>
      </AbsoluteFill>

      {/* Bottom bar */}
      <div
        style={{
          position: "absolute",
          bottom: 80,
          left: 60,
          right: 60,
          display: "flex",
          justifyContent: "center",
          gap: 12,
        }}
      >
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            style={{
              width: n === phase.number ? 40 : 12,
              height: 6,
              borderRadius: 3,
              background: n === phase.number ? COLORS.accent : "rgba(255,255,255,0.25)",
              transition: "width 0.3s",
            }}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ── CTA slide (last) ─────────────────────────────────────────
const CTASlide: React.FC<{ cta: string; ctaSub: string }> = ({ cta, ctaSub }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoIn = spring({ frame, fps, config: { damping: 15, stiffness: 80 } });
  const ctaIn = spring({ frame: frame - 15, fps, config: { damping: 18, stiffness: 70 } });
  const subIn = spring({ frame: frame - 25, fps, config: { damping: 20, stiffness: 60 } });
  const glow = 12 + 10 * Math.sin(frame * 0.12);
  const float = Math.sin(frame * 0.03) * 5;

  return (
    <AbsoluteFill>
      <AnimatedBg color={COLORS.primaryContainer} />

      {/* Expanding rings */}
      {[0, 1, 2].map((i) => {
        const ringScale = interpolate(frame, [0, 120], [0.3 + i * 0.2, 1.5 + i * 0.3], {
          extrapolateRight: "clamp",
        });
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: 400,
              height: 400,
              borderRadius: "50%",
              border: `2px solid ${COLORS.accent}`,
              transform: `translate(-50%, -50%) scale(${ringScale})`,
              opacity: 0.05 + 0.02 * Math.sin(frame * 0.03 + i),
            }}
          />
        );
      })}

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 30,
          padding: 60,
        }}
      >
        {/* Logo */}
        <div
          style={{
            opacity: logoIn,
            transform: `scale(${logoIn}) translateY(${float}px)`,
            fontSize: 36,
            fontWeight: 800,
            color: COLORS.white,
            letterSpacing: 3,
          }}
        >
          EU FUNDING SCHOOL
        </div>

        <div
          style={{
            width: 100,
            height: 5,
            background: COLORS.accent,
            borderRadius: 3,
            opacity: logoIn,
          }}
        />

        {/* CTA text */}
        <h2
          style={{
            opacity: ctaIn,
            transform: `translateY(${interpolate(ctaIn, [0, 1], [30, 0])}px)`,
            fontSize: 52,
            fontWeight: 800,
            textAlign: "center",
            color: COLORS.white,
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {cta}
        </h2>

        <p
          style={{
            opacity: subIn,
            fontSize: 28,
            color: COLORS.white,
            textAlign: "center",
            margin: 0,
            opacity: subIn * 0.7,
          }}
        >
          {ctaSub}
        </p>

        {/* CTA Button */}
        <div
          style={{
            opacity: ctaIn,
            transform: `translateY(${Math.sin(frame * 0.04) * 4}px)`,
            background: COLORS.accent,
            color: COLORS.primary,
            padding: "22px 60px",
            borderRadius: 30,
            fontSize: 34,
            fontWeight: 800,
            marginTop: 20,
            boxShadow: `0 0 ${glow}px ${COLORS.accent}, 0 0 ${glow * 2}px rgba(231,235,0,0.2)`,
          }}
        >
          eufundingschool.com
        </div>

        {/* Social proof */}
        <div
          style={{
            opacity: subIn * 0.6,
            fontSize: 22,
            color: COLORS.white,
            marginTop: 10,
          }}
        >
          +2.400 coordinadores ya están dentro
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── Main composition ─────────────────────────────────────────
export const SocialReel: React.FC<SocialReelProps> = ({
  hook,
  phases,
  cta,
  ctaSub,
  musicTrack,
}) => {
  return (
    <AbsoluteFill style={{ fontFamily: FONTS.family, background: COLORS.primary }}>
      {/* Music */}
      {musicTrack && (
        <Audio src={staticFile(`audio/${musicTrack}`)} volume={0.5} />
      )}

      <TransitionSeries>
        {/* Hook */}
        <TransitionSeries.Sequence durationInFrames={PHASE_DURATION}>
          <HookSlide text={hook} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-bottom" })}
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
        />

        {/* Phases */}
        {phases.map((phase, i) => (
          <React.Fragment key={i}>
            <TransitionSeries.Sequence durationInFrames={PHASE_DURATION}>
              <PhaseSlide phase={phase} />
            </TransitionSeries.Sequence>
            <TransitionSeries.Transition
              presentation={i % 2 === 0 ? slide({ direction: "from-bottom" }) : wipe({ direction: "from-left" })}
              timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
            />
          </React.Fragment>
        ))}

        {/* CTA */}
        <TransitionSeries.Sequence durationInFrames={PHASE_DURATION + 30}>
          <CTASlide cta={cta} ctaSub={ctaSub} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
