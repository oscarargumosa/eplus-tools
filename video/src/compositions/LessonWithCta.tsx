import React from "react";
import { Series, useVideoConfig } from "remotion";
import type { LessonData } from "../types";
import { Lesson, calculateTotalFrames } from "./Lesson";
import { CtaOutro } from "./CtaOutro";

interface AudioManifestEntry {
  slide: number;
  file: string | null;
  duration: number | null;
}

interface CtaContent {
  audioFile?: string;
  projectChips?: string[];
  profileChips?: string[];
  tagText?: string;
  headline?: string;
  accentWord?: string;
  profilesLine?: string;
}

interface LessonWithCtaProps {
  data: LessonData;
  audioFolder?: string;
  audioManifest?: AudioManifestEntry[];
  musicTrack?: string;
  sfxTransition?: string;
  ctaImages: string[];
  ctaDurationFrames: number;
  ctaContent?: CtaContent;
}

/**
 * Plays a lesson and then the reusable CTA outro, back to back.
 * The lesson data passed in should NOT include its own outro slide
 * (the CTA replaces it).
 */
export const LessonWithCta: React.FC<LessonWithCtaProps> = ({
  data,
  audioFolder,
  audioManifest,
  musicTrack,
  sfxTransition,
  ctaImages,
  ctaDurationFrames,
  ctaContent,
}) => {
  const { fps } = useVideoConfig();
  const lessonFrames = calculateTotalFrames(data, fps, audioManifest);

  return (
    <Series>
      <Series.Sequence durationInFrames={lessonFrames}>
        <Lesson
          data={data}
          audioFolder={audioFolder}
          audioManifest={audioManifest}
          musicTrack={musicTrack}
          sfxTransition={sfxTransition}
        />
      </Series.Sequence>
      <Series.Sequence durationInFrames={ctaDurationFrames}>
        <CtaOutro images={ctaImages} {...ctaContent} />
      </Series.Sequence>
    </Series>
  );
};
