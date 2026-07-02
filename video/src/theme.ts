// ═══════════════════════════════════════════════════════════════
// EU Funding School — Video Design System
// Palette, typography, spacing, and layout constants
// ═══════════════════════════════════════════════════════════════

// ── Video dimensions ──────────────────────────────────────────
export const VIDEO = {
  width: 1920,
  height: 1080,
  fps: 30,
} as const;

// ── Color palette (from EUFunding School brand) ──────────────
export const COLORS = {
  // Primary
  primary: "#06003e",
  primaryContainer: "#1b1464",

  // Accent
  accent: "#e7eb00",
  accentDim: "#cbce00",

  // Surfaces
  surface: "#f7f9fb",
  surfaceDim: "#d8dadc",
  surfaceContainer: "#eceef0",
  surfaceContainerLow: "#f2f4f6",
  white: "#ffffff",

  // Text
  onSurface: "#191c1e",
  onSurfaceVariant: "#474551",
  outline: "#787682",
  outlineVariant: "#c8c5d2",

  // Semantic
  surfaceTint: "#5855a3",
  onPrimaryContainer: "#8481d3",
  error: "#ba1a1a",
  success: "#2d6a4f",

  // Transparent overlays
  overlayLight: "rgba(6, 0, 62, 0.06)",
  overlayDark: "rgba(6, 0, 62, 0.85)",
} as const;

// ── Typography ───────────────────────────────────────────────
export const FONTS = {
  family: "Manrope, sans-serif",
  weights: {
    light: 300,
    regular: 400,
    medium: 500,
    semiBold: 600,
    bold: 700,
    extraBold: 800,
  },
  sizes: {
    hero: 72,        // Big title on intro slides
    title: 56,       // Section titles
    subtitle: 40,    // Subtitles, section headers
    heading: 32,     // Bullet headings
    body: 28,        // Body text, bullet content
    caption: 22,     // Captions, small labels
    small: 18,       // Fine print, watermarks
  },
} as const;

// ── Spacing & layout ─────────────────────────────────────────
export const LAYOUT = {
  padding: {
    slide: 80,       // Outer padding for all slides
    inner: 40,       // Inner spacing between elements
  },
  borderRadius: {
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  logo: {
    width: 200,
    height: 60,
  },
} as const;

// ── Animation presets (in frames at 30fps) ───────────────────
export const TIMING = {
  fadeIn: 15,         // 0.5s
  fadeOut: 12,        // 0.4s
  slideIn: 18,        // 0.6s
  stagger: 8,         // 0.27s between bullet items
  holdMin: 90,        // 3s minimum hold per slide
  transitionGap: 6,   // 0.2s gap between slides
} as const;

// ── Gradient presets ─────────────────────────────────────────
export const GRADIENTS = {
  // Dark slide: deep blue to slightly lighter
  dark: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.primaryContainer} 100%)`,
  // Light slide: subtle warm surface
  light: `linear-gradient(135deg, ${COLORS.white} 0%, ${COLORS.surfaceContainerLow} 100%)`,
  // Accent overlay: for highlight slides
  accent: `linear-gradient(135deg, ${COLORS.primaryContainer} 0%, ${COLORS.surfaceTint} 100%)`,
  // Bottom fade for text over images
  bottomFade: `linear-gradient(to top, rgba(6,0,62,0.9) 0%, transparent 100%)`,
} as const;
