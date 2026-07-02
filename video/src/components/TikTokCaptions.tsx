import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { COLORS, FONTS } from "../theme";

interface CaptionWord {
  text: string;
  fromFrame: number;
  toFrame: number;
}

interface CaptionPage {
  words: CaptionWord[];
  fromFrame: number;
  toFrame: number;
}

interface TikTokCaptionsProps {
  pages: CaptionPage[];
  position?: "bottom" | "center";
  fontSize?: number;
  highlightColor?: string;
  shadowColor?: string;
}

/**
 * TikTok-style animated captions with word-by-word highlighting.
 * Each "page" shows a few words at a time, with the current word
 * highlighted and slightly scaled.
 */
export const TikTokCaptions: React.FC<TikTokCaptionsProps> = ({
  pages,
  position = "bottom",
  fontSize = 32,
  highlightColor = COLORS.accent,
  shadowColor = "rgba(0,0,0,0.8)",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Find the current active page
  const currentPage = pages.find(
    (p) => frame >= p.fromFrame && frame < p.toFrame
  );

  if (!currentPage) return null;

  // Page entrance animation
  const pageEntrance = spring({
    frame: frame - currentPage.fromFrame,
    fps,
    config: { damping: 20, stiffness: 100 },
  });

  const top = position === "center" ? "45%" : "86%";

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 200,
        opacity: pageEntrance,
        transform: `translateY(${interpolate(pageEntrance, [0, 1], [15, 0])}px)`,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "4px 8px",
          maxWidth: "58%",
          padding: "5px 14px",
          borderRadius: 8,
          background: "rgba(0,0,0,0.32)",
          backdropFilter: "blur(4px)",
        }}
      >
        {currentPage.words.map((word, i) => {
          const isActive = frame >= word.fromFrame && frame < word.toFrame;
          const isPast = frame >= word.toFrame;
          const wordEntrance = spring({
            frame: frame - word.fromFrame,
            fps,
            config: { damping: 15, stiffness: 120 },
          });

          // Scale punch when word becomes active
          const scale = isActive
            ? interpolate(wordEntrance, [0, 0.5, 1], [1, 1.05, 1.02])
            : 1;

          return (
            <span
              key={i}
              style={{
                fontSize,
                fontFamily: FONTS.family,
                fontWeight: isActive
                  ? FONTS.weights.extraBold
                  : FONTS.weights.bold,
                color: isActive
                  ? highlightColor
                  : isPast
                    ? COLORS.white
                    : "rgba(255,255,255,0.5)",
                textShadow: `0 2px 8px ${shadowColor}`,
                transform: `scale(${scale})`,
                display: "inline-block",
                transition: "color 0.1s",
                whiteSpace: "pre",
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Helper: convert narration text + timing into caption pages.
 * Splits text into pages of N words, distributes timing evenly.
 */
export function generateCaptionPages(
  narration: string,
  startFrame: number,
  durationFrames: number,
  wordsPerPage = 5,
  fps = 30
): CaptionPage[] {
  const allWords = narration.split(/\s+/).filter(Boolean);
  if (allWords.length === 0) return [];

  const pages: CaptionPage[] = [];
  const totalWords = allWords.length;
  const framesPerWord = durationFrames / totalWords;

  for (let i = 0; i < totalWords; i += wordsPerPage) {
    const pageWords = allWords.slice(i, i + wordsPerPage);
    const pageFromFrame = startFrame + Math.round(i * framesPerWord);
    const pageToFrame =
      startFrame + Math.round((i + pageWords.length) * framesPerWord);

    const words: CaptionWord[] = pageWords.map((text, j) => {
      const wordIndex = i + j;
      return {
        text,
        fromFrame: startFrame + Math.round(wordIndex * framesPerWord),
        toFrame: startFrame + Math.round((wordIndex + 1) * framesPerWord),
      };
    });

    pages.push({
      words,
      fromFrame: pageFromFrame,
      toFrame: pageToFrame,
    });
  }

  return pages;
}
