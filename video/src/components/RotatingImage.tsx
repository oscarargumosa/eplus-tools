import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/** Local bank paths need staticFile(); remote URLs pass through. */
const resolveSrc = (src: string) =>
  /^https?:\/\//.test(src) ? src : staticFile(src);

interface RotatingImageProps {
  /** One or more image URLs. With ≥2, the slide cycles through them. */
  images: string[];
  /** Max seconds any single image stays on screen before switching. */
  maxSecondsPerImage?: number;
  /** Crossfade length in frames between images. */
  fadeFrames?: number;
}

/**
 * Full-bleed background that never lets a single image sit longer than
 * `maxSecondsPerImage`. It splits the host sequence duration into equal
 * chunks (≤ maxSeconds each), assigns an image per chunk (cycling through
 * the list), and crossfades between them with a continuous Ken Burns push.
 *
 * Fills the nearest positioned ancestor (uses AbsoluteFill), so it works
 * both as a slide background and inside a split-panel container.
 */
export const RotatingImage: React.FC<RotatingImageProps> = ({
  images,
  maxSecondsPerImage = 5,
  fadeFrames = 12,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();

  const list = images.filter(Boolean);
  if (list.length === 0) return null;

  const durationSeconds = durationInFrames / fps;
  const chunks = Math.max(1, Math.ceil(durationSeconds / maxSecondsPerImage));
  const chunkFrames = durationInFrames / chunks;

  return (
    <AbsoluteFill>
      {Array.from({ length: chunks }).map((_, c) => {
        const src = list[c % list.length];
        const start = c * chunkFrames;
        const end = start + chunkFrames;

        // Crossfade in/out (first chunk is fully visible from frame 0).
        const opacity = interpolate(
          frame,
          [start - fadeFrames, start, end - fadeFrames, end],
          [0, 1, 1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        if (opacity <= 0) return null;

        // Ken Burns: fresh push per chunk so each image feels alive.
        const local = (frame - start) / chunkFrames; // 0 → 1 within chunk
        const scale = 1.06 + local * 0.1;
        const x = local * -16;
        const y = local * -8;

        return (
          <AbsoluteFill key={c} style={{ opacity }}>
            <Img
              src={resolveSrc(src)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transform: `scale(${scale}) translate(${x}px, ${y}px)`,
              }}
            />
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};
