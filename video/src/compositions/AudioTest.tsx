import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";

export const AudioTest: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        background: "#06003e",
        color: "white",
        fontFamily: "Manrope, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        padding: 80,
      }}
    >
      {/* Music */}
      <Audio src={staticFile("audio/music/bg-energy-short.wav")} volume={0.1} />

      {/* Narration on top */}
      <Audio src={staticFile("audio/ka-lines/slide-00.wav")} volume={1.5} />

      <h1 style={{ fontSize: 48 }}>Audio Test - Frame {frame}</h1>
      <p style={{ fontSize: 28, color: "#e7eb00" }}>Music + Voice</p>
      <p style={{ fontSize: 20, opacity: 0.4 }}>
        Should hear energetic music AND Spanish narration together.
      </p>
    </AbsoluteFill>
  );
};
