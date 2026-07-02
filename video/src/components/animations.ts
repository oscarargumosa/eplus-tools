import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

// ── Fade in from bottom ──────────────────────────────────────
export function useFadeIn(delay = 0) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 20, stiffness: 80 },
  });

  return {
    opacity: progress,
    transform: `translateY(${interpolate(progress, [0, 1], [30, 0])}px)`,
  };
}

// ── Scale in (for icons, badges) ─────────────────────────────
export function useScaleIn(delay = 0) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 15, stiffness: 100 },
  });

  return {
    opacity: progress,
    transform: `scale(${interpolate(progress, [0, 1], [0.6, 1])})`,
  };
}

// ── Slide in from left ───────────────────────────────────────
export function useSlideInLeft(delay = 0) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 20, stiffness: 70 },
  });

  return {
    opacity: progress,
    transform: `translateX(${interpolate(progress, [0, 1], [-60, 0])}px)`,
  };
}

// ── Slide in from right ──────────────────────────────────────
export function useSlideInRight(delay = 0) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 20, stiffness: 70 },
  });

  return {
    opacity: progress,
    transform: `translateX(${interpolate(progress, [0, 1], [60, 0])}px)`,
  };
}

// ── Draw line (for connectors, underlines) ───────────────────
export function useDrawLine(delay = 0, duration = 20) {
  const frame = useCurrentFrame();

  const progress = interpolate(frame - delay, [0, duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return progress;
}

// ── Continuous float (never stops moving) ────────────────────
export function useFloat(amplitude = 4, speed = 0.04, phase = 0) {
  const frame = useCurrentFrame();
  const y = Math.sin(frame * speed + phase) * amplitude;
  const x = Math.cos(frame * speed * 0.7 + phase) * amplitude * 0.5;
  return { transform: `translate(${x}px, ${y}px)` };
}

// ── Continuous pulse (scale oscillation) ─────────────────────
export function usePulse(min = 0.97, max = 1.03, speed = 0.05, phase = 0) {
  const frame = useCurrentFrame();
  const scale = min + (max - min) * (0.5 + 0.5 * Math.sin(frame * speed + phase));
  return { transform: `scale(${scale})` };
}

// ── Continuous glow (opacity oscillation) ────────────────────
export function useGlow(min = 0.5, max = 1, speed = 0.06, phase = 0) {
  const frame = useCurrentFrame();
  return min + (max - min) * (0.5 + 0.5 * Math.sin(frame * speed + phase));
}

// ── Progressive reveal: returns 0→1 spread across duration ──
// Use for staggering bullets timed to narration, not spring (which is instant)
export function useProgressiveReveal(
  index: number,
  total: number,
  totalFrames: number,
  entryDuration = 20
) {
  const frame = useCurrentFrame();
  // Spread items evenly across 80% of total duration (leave 20% at end)
  const usableDuration = totalFrames * 0.75;
  const startFrame = (index / total) * usableDuration;

  const progress = interpolate(frame - startFrame, [0, entryDuration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const translateY = interpolate(progress, [0, 1], [25, 0]);
  const translateX = interpolate(progress, [0, 1], [-20, 0]);

  return {
    opacity: progress,
    transform: `translate(${translateX}px, ${translateY}px)`,
    isVisible: progress > 0,
  };
}

// ── Accent underline that draws across ───────────────────────
export function useUnderlineDraw(delay = 0, duration = 30) {
  const frame = useCurrentFrame();
  const width = interpolate(frame - delay, [0, duration], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return `${width}%`;
}

// ── Typewriter effect ────────────────────────────────────────
export function useTypewriter(text: string, delay = 0, charsPerFrame = 1.5) {
  const frame = useCurrentFrame();
  const visibleChars = Math.min(
    text.length,
    Math.floor((frame - delay) * charsPerFrame)
  );

  return visibleChars > 0 ? text.slice(0, visibleChars) : "";
}
