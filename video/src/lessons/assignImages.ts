import type { LessonData } from "../types";

interface AudioEntry {
  slide: number;
  duration: number | null;
}

/**
 * Fills each slide's `images` with UNIQUE picks from the image bank so that
 * no single image repeats anywhere in the presentation.
 *
 * - Number of images per slide matches RotatingImage's chunking
 *   (ceil(slideSeconds / maxSecondsPerImage)), so every image is actually shown.
 * - Draws from the slide's `theme` pool first, advancing a per-theme cursor so
 *   slides sharing a theme get different images; falls back to the global pool
 *   if a theme runs dry. Only repeats as an absolute last resort (bank too small).
 * - Slides that already declare `images` are left untouched; slides without a
 *   `theme` (e.g. outro) keep their background as-is.
 */
export function assignBankImages(
  data: LessonData,
  bank: Record<string, string[]>,
  audio: AudioEntry[],
  fps: number,
  maxSecondsPerImage = 5,
  padSeconds = 0.5
): LessonData {
  const used = new Set<string>();
  const cursors: Record<string, number> = {};
  const allImages = Object.values(bank).flat();

  const pickUnique = (theme: string | undefined, n: number): string[] => {
    const pool = theme && bank[theme]?.length ? bank[theme] : allImages;
    const key = theme && bank[theme]?.length ? theme : "__all__";
    cursors[key] = cursors[key] ?? 0;

    const picks: string[] = [];
    // 1) advance through the theme pool, skipping already-used images
    while (picks.length < n && cursors[key] < pool.length) {
      const img = pool[cursors[key]++];
      if (!used.has(img)) {
        used.add(img);
        picks.push(img);
      }
    }
    // 2) fall back to any unused image globally
    if (picks.length < n) {
      for (const img of allImages) {
        if (picks.length >= n) break;
        if (!used.has(img)) {
          used.add(img);
          picks.push(img);
        }
      }
    }
    // 3) last resort: bank smaller than total demand → allow repeats
    if (picks.length < n && pool.length) {
      let i = 0;
      while (picks.length < n) picks.push(pool[i++ % pool.length]);
    }
    return picks;
  };

  const slides = data.slides.map((s, i) => {
    if (s.images && s.images.length) return s; // explicit images win
    if (!s.theme) return s; // no themed background requested
    const dur = audio.find((a) => a.slide === i)?.duration ?? s.durationInSeconds ?? 6;
    const n = Math.max(1, Math.ceil((dur + padSeconds) / maxSecondsPerImage));
    return { ...s, images: pickUnique(s.theme, n) };
  });

  return { ...data, slides };
}
