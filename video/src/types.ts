// ═══════════════════════════════════════════════════════════════
// Types for lesson video generation
// ═══════════════════════════════════════════════════════════════

export type SlideType =
  | "intro"
  | "bullets"
  | "diagram"
  | "highlight"
  | "image"
  | "split"
  | "stats"
  | "outro";

export type SlideVariant = "dark" | "light" | "accent";

export interface SlideBase {
  type: SlideType;
  variant?: SlideVariant;
  durationInSeconds?: number;
  narration?: string;
  /** Optional full-bleed background image (Ken Burns) for text slides. */
  imageUrl?: string;
  /** Multiple background images that rotate (≤5s each) within the slide. */
  images?: string[];
  /** Image-bank theme; the assigner fills `images` with unique picks. */
  theme?: string;
}

// ── Intro: big title, tag, subtitle ──────────────────────────
export interface IntroSlide extends SlideBase {
  type: "intro";
  title: string;
  subtitle?: string;
  tag?: string;
}

// ── Bullets: title + bullet points ───────────────────────────
export interface BulletSlide extends SlideBase {
  type: "bullets";
  title: string;
  bullets: string[];
  icon?: string;
}

// ── Diagram: process steps with connectors ───────────────────
export interface DiagramSlide extends SlideBase {
  type: "diagram";
  title: string;
  steps: {
    label: string;
    description?: string;
    icon?: string;
  }[];
}

// ── Highlight: key stat, quote, or fact ──────────────────────
export interface HighlightSlide extends SlideBase {
  type: "highlight";
  text: string;
  source?: string;
  icon?: string;
}

// ── Image: full-bleed image with caption ─────────────────────
export interface ImageSlide extends SlideBase {
  type: "image";
  title?: string;
  imageUrl: string;
  caption?: string;
}

// ── Split: image left + text right (or reversed) ─────────────
export interface SplitSlide extends SlideBase {
  type: "split";
  title: string;
  text: string;
  imageUrl: string;
  imagePosition?: "left" | "right";
  bullets?: string[];
}

// ── Stats: 2-4 big numbers with labels ───────────────────────
export interface StatsSlide extends SlideBase {
  type: "stats";
  title?: string;
  stats: {
    value: number;
    suffix?: string;
    label: string;
  }[];
}

// ── Outro: closing CTA ──────────────────────────────────────
export interface OutroSlide extends SlideBase {
  type: "outro";
  title?: string;
  subtitle?: string;
  cta?: string;
}

export type Slide =
  | IntroSlide
  | BulletSlide
  | DiagramSlide
  | HighlightSlide
  | ImageSlide
  | SplitSlide
  | StatsSlide
  | OutroSlide;

export interface LessonData {
  id: string;
  title: string;
  category?: string;
  slides: Slide[];
}
