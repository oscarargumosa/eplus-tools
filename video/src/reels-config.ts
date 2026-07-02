// ═══════════════════════════════════════════════════════════════
// Reels Production Config — based on docs/REELS-RULES.md
// Cross-platform safe zones, typography, timing
// ═══════════════════════════════════════════════════════════════

export const REEL = {
  width: 1080,
  height: 1920,
  fps: 30,

  // Universal safe zones (works on IG, TikTok, YT Shorts)
  safe: {
    top: 150,
    bottom: 480,
    left: 60,
    right: 192,
    // Derived content area
    contentWidth: 1080 - 60 - 192,   // 828px
    contentHeight: 1920 - 150 - 480,  // 1290px
    contentX: 60,
    contentY: 150,
  },

  // Typography (minimum 28px, nothing below!)
  fonts: {
    hook: { size: 82, weight: 800, maxChars: 25 },
    title: { size: 58, weight: 800, maxChars: 30 },
    body: { size: 38, weight: 500, maxChars: 30 },
    label: { size: 30, weight: 600, maxChars: 35 },
    caption: { size: 48, weight: 700, maxChars: 30 },
    lineHeight: 1.3,
    maxLinesOnScreen: 3,
  },

  // Timing rules (in frames at 30fps)
  timing: {
    hookTextAppearFrame: 3,     // text visible by frame 3-5
    hookDurationFrames: 90,     // 3 seconds
    minTextDisplayFrames: 60,   // 2 seconds minimum
    maxSilenceFrames: 15,       // 0.5s max silence
    transitionFrames: 8,        // fast transitions
    // Cut frequency
    hookCutEvery: [30, 60],     // 1-2s per shot in hook
    valueCutEvery: [90, 150],   // 3-5s per shot in value
  },

  // Audio levels (as Remotion volume 0-1)
  audio: {
    musicUnderVoice: 0.06,      // ~-15dB
    musicOnly: 0.25,            // ~-6dB
    voiceLevel: 1.5,
    sfxLevel: 0.12,
  },

  // Text styling
  textStyle: {
    color: "#FFFFFF",
    pillBg: "rgba(0,0,0,0.65)",
    pillPaddingH: 20,
    pillPaddingV: 12,
    pillRadius: 14,
    shadowStroke: "0 2px 8px rgba(0,0,0,0.7)",
  },
} as const;
