import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import {
  TransitionSeries,
  linearTiming,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import type { LessonData, Slide } from "../types";
import {
  IntroSlide,
  BulletSlide,
  DiagramSlide,
  HighlightSlide,
  ImageSlide,
  SplitSlide,
  StatsSlide,
  OutroSlide,
} from "../components";
import { ProgressBar } from "../components/ProgressBar";
import { TopBanner } from "../components/TopBanner";
import { TikTokCaptions, generateCaptionPages } from "../components/TikTokCaptions";

const DEFAULT_DURATIONS: Record<string, number> = {
  intro: 7,
  bullets: 12,
  diagram: 12,
  highlight: 8,
  image: 8,
  split: 10,
  stats: 8,
  outro: 6,
};

const TRANSITION_FRAMES = 7;

const TRANSITIONS = [
  () => fade(),
  () => slide({ direction: "from-right" }),
  () => wipe({ direction: "from-left" }),
  () => fade(),
  () => slide({ direction: "from-bottom" }),
  () => wipe({ direction: "from-right" }),
];

interface AudioManifestEntry {
  slide: number;
  file: string | null;
  duration: number | null;
}

interface LessonProps {
  data: LessonData;
  audioFolder?: string;
  audioManifest?: AudioManifestEntry[];
  musicTrack?: string;
  sfxTransition?: string;
}

function getSlideDuration(
  s: Slide,
  index: number,
  fps: number,
  manifest?: AudioManifestEntry[]
): number {
  if (manifest) {
    const entry = manifest.find((e) => e.slide === index);
    if (entry?.duration) {
      return Math.round((entry.duration + 0.5) * fps);
    }
  }
  if (s.durationInSeconds) {
    return Math.round(s.durationInSeconds * fps);
  }
  return Math.round((DEFAULT_DURATIONS[s.type] ?? 6) * fps);
}

function renderSlide(s: Slide) {
  switch (s.type) {
    case "intro":
      return <IntroSlide data={s} />;
    case "bullets":
      return <BulletSlide data={s} />;
    case "diagram":
      return <DiagramSlide data={s} />;
    case "highlight":
      return <HighlightSlide data={s} />;
    case "image":
      return <ImageSlide data={s} />;
    case "split":
      return <SplitSlide data={s} />;
    case "stats":
      return <StatsSlide data={s} />;
    case "outro":
      return <OutroSlide data={s} />;
    default:
      return null;
  }
}

export const Lesson: React.FC<LessonProps> = ({
  data,
  audioFolder,
  audioManifest,
  musicTrack,
  sfxTransition,
}) => {
  const { fps } = useVideoConfig();
  const totalSlides = data.slides.length;

  // Pre-calculate slide absolute start frames (accounting for transition overlap)
  const slideStarts: number[] = [];
  let acc = 0;
  for (let i = 0; i < data.slides.length; i++) {
    slideStarts.push(acc);
    const dur = getSlideDuration(data.slides[i], i, fps, audioManifest);
    acc += dur;
    // Subtract transition overlap (except after last slide)
    if (i < data.slides.length - 1) {
      acc -= TRANSITION_FRAMES;
    }
  }

  return (
    <AbsoluteFill>
      {/* ── Persistent top banner (always visible, above everything) ── */}
      <TopBanner title={data.title} />

      {/* ── Background music (top level, outside TransitionSeries) ── */}
      {musicTrack && (
        <Audio
          src={staticFile(`audio/${musicTrack}`)}
          volume={(f) => {
            // Duck when narration is playing
            if (!audioManifest) return 0.15;
            for (let i = 0; i < slideStarts.length; i++) {
              const entry = audioManifest.find((e) => e.slide === i);
              if (!entry?.duration) continue;
              const start = slideStarts[i];
              const end = start + Math.round(entry.duration * fps);
              if (f >= start && f < end) return 0.05;
            }
            return 0.15;
          }}
        />
      )}

      {/* ── Narration audio (top level Sequences, NOT inside TransitionSeries) ── */}
      {data.slides.map((slideData, i) => {
        const audioEntry = audioManifest?.find((e) => e.slide === i);
        if (!audioFolder || !audioEntry?.file) return null;

        const duration = getSlideDuration(slideData, i, fps, audioManifest);
        return (
          <Sequence key={`audio-${i}`} from={slideStarts[i]} durationInFrames={duration}>
            <Audio
              src={staticFile(`audio/${audioFolder}/${audioEntry.file}`)}
              volume={1.5}
            />
          </Sequence>
        );
      })}

      {/* ── Transition SFX (top level) ── */}
      {sfxTransition &&
        data.slides.map((_, i) => {
          if (i === 0) return null;
          return (
            <Sequence key={`sfx-${i}`} from={slideStarts[i]} durationInFrames={30}>
              <Audio src={staticFile(`audio/${sfxTransition}`)} volume={0.1} />
            </Sequence>
          );
        })}

      {/* ── TikTok-style captions (synced to narration) ── */}
      {data.slides.map((slideData, i) => {
        if (!slideData.narration) return null;
        const audioEntry = audioManifest?.find((e) => e.slide === i);
        const narrationDuration = audioEntry?.duration
          ? Math.round(audioEntry.duration * fps)
          : getSlideDuration(slideData, i, fps, audioManifest) - 30;

        const pages = generateCaptionPages(
          slideData.narration,
          slideStarts[i],
          narrationDuration,
          5,
          fps
        );

        return (
          <Sequence
            key={`captions-${i}`}
            from={slideStarts[i]}
            durationInFrames={getSlideDuration(slideData, i, fps, audioManifest)}
          >
            <TikTokCaptions pages={pages.map(p => ({
              ...p,
              fromFrame: p.fromFrame - slideStarts[i],
              toFrame: p.toFrame - slideStarts[i],
              words: p.words.map(w => ({
                ...w,
                fromFrame: w.fromFrame - slideStarts[i],
                toFrame: w.toFrame - slideStarts[i],
              })),
            }))} />
          </Sequence>
        );
      })}

      {/* ── Visual slides with pro transitions ── */}
      <TransitionSeries>
        {data.slides.map((slideData, i) => {
          const duration = getSlideDuration(slideData, i, fps, audioManifest);
          const transitionFn = TRANSITIONS[i % TRANSITIONS.length];

          return (
            <React.Fragment key={i}>
              <TransitionSeries.Sequence durationInFrames={duration}>
                {renderSlide(slideData)}
                <ProgressBar slideIndex={i} totalSlides={totalSlides} />
              </TransitionSeries.Sequence>

              {i < data.slides.length - 1 && (
                <TransitionSeries.Transition
                  presentation={transitionFn()}
                  timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
                />
              )}
            </React.Fragment>
          );
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};

export function calculateTotalFrames(
  data: LessonData,
  fps: number,
  manifest?: AudioManifestEntry[]
): number {
  const slidesTotal = data.slides.reduce((total, s, i) => {
    return total + getSlideDuration(s, i, fps, manifest);
  }, 0);
  const transitionOverlap = (data.slides.length - 1) * TRANSITION_FRAMES;
  return slidesTotal - transitionOverlap;
}
