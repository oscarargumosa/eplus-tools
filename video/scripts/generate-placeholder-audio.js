/**
 * Generate placeholder audio files (background music + SFX)
 * using pure JavaScript WAV generation.
 * Replace these with real royalty-free tracks later.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// WAV file writer
function writeWav(filePath, sampleRate, samples) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  // fmt sub-chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const val = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(val * 32767), 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
}

// Generate ambient background pad (4 minutes)
function generateAmbientPad(sampleRate, durationSec) {
  const numSamples = sampleRate * durationSec;
  const samples = new Float64Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;

    // Slow evolving chord (C major-ish pad)
    const freq1 = 130.81; // C3
    const freq2 = 164.81; // E3
    const freq3 = 196.00; // G3
    const freq4 = 261.63; // C4

    // Gentle sine waves with slow LFO modulation
    const lfo1 = 1 + 0.3 * Math.sin(2 * Math.PI * 0.05 * t);
    const lfo2 = 1 + 0.3 * Math.sin(2 * Math.PI * 0.07 * t + 1);

    const wave1 = Math.sin(2 * Math.PI * freq1 * t) * 0.15 * lfo1;
    const wave2 = Math.sin(2 * Math.PI * freq2 * t) * 0.12 * lfo2;
    const wave3 = Math.sin(2 * Math.PI * freq3 * t) * 0.10 * lfo1;
    const wave4 = Math.sin(2 * Math.PI * freq4 * t) * 0.06;

    // Combine and apply global envelope
    const fadeIn = Math.min(1, t / 3); // 3s fade in
    const fadeOut = Math.min(1, (durationSec - t) / 3); // 3s fade out
    const envelope = fadeIn * fadeOut;

    samples[i] = (wave1 + wave2 + wave3 + wave4) * envelope * 0.5;
  }

  return samples;
}

// Generate whoosh sound effect
function generateWhoosh(sampleRate, durationSec) {
  const numSamples = Math.round(sampleRate * durationSec);
  const samples = new Float64Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = t / durationSec;

    // White noise filtered with sweeping bandpass (simulated)
    const noise = (Math.random() * 2 - 1);

    // Frequency sweep from low to high
    const sweepFreq = 200 + progress * 2000;
    const resonance = Math.sin(2 * Math.PI * sweepFreq * t);

    // Envelope: quick attack, medium decay
    const envelope =
      Math.pow(Math.sin(Math.PI * progress), 0.6) *
      (1 - progress * 0.3);

    samples[i] = noise * resonance * envelope * 0.3;
  }

  return samples;
}

// Main
const sampleRate = 44100;

console.log("Generating placeholder audio files...\n");

// Background music (4 minutes)
const musicPath = path.join(__dirname, "..", "public", "audio", "music", "bg-corporate.wav");
console.log("  Generating ambient pad (4 min)...");
const musicSamples = generateAmbientPad(sampleRate, 240);
writeWav(musicPath, sampleRate, musicSamples);
console.log(`  ✓ ${musicPath}`);

// Whoosh SFX (0.5 seconds)
const whooshPath = path.join(__dirname, "..", "public", "audio", "sfx", "whoosh.wav");
console.log("  Generating whoosh SFX (0.5s)...");
const whooshSamples = generateWhoosh(sampleRate, 0.5);
writeWav(whooshPath, sampleRate, whooshSamples);
console.log(`  ✓ ${whooshPath}`);

console.log("\n  Done! Replace these with real royalty-free tracks for production.");
console.log("  Recommended sources: mixkit.co, pixabay.com/music\n");
