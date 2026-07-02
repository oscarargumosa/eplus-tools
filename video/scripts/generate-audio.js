/**
 * EU Funding School — TTS Audio Generator
 *
 * Reads a lesson file, generates audio for each slide narration,
 * and saves WAV/MP3 files to the audio output folder.
 *
 * Usage:
 *   node scripts/generate-audio.js --lesson ka-lines
 *   node scripts/generate-audio.js --lesson ka-lines --voice nova
 *   node scripts/generate-audio.js --lesson ka-lines --provider elevenlabs
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = path.join(__dirname, "..", "src", "audio");

// ── Parse CLI args ───────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    lesson: null,
    provider: process.env.TTS_PROVIDER || "openai",
    voice: null,
    speed: 1.0,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--lesson" && args[i + 1]) parsed.lesson = args[++i];
    if (args[i] === "--provider" && args[i + 1]) parsed.provider = args[++i];
    if (args[i] === "--voice" && args[i + 1]) parsed.voice = args[++i];
    if (args[i] === "--speed" && args[i + 1]) parsed.speed = parseFloat(args[++i]);
  }

  if (!parsed.lesson) {
    console.error("Usage: node scripts/generate-audio.js --lesson <lesson-name>");
    console.error("Example: node scripts/generate-audio.js --lesson ka-lines");
    process.exit(1);
  }

  return parsed;
}

// ── OpenAI TTS ───────────────────────────────────────────────
async function generateWithOpenAI(text, outputPath, voice, speed = 1.0) {
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await openai.audio.speech.create({
    model: process.env.OPENAI_TTS_MODEL || "tts-1-hd",
    voice: voice || process.env.OPENAI_TTS_VOICE || "nova",
    input: text,
    response_format: "mp3",
    speed,
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

// ── ElevenLabs TTS ───────────────────────────────────────────
async function generateWithElevenLabs(text, outputPath, voice, speed = 1.0) {
  const voiceId = voice || process.env.ELEVENLABS_VOICE_ID;
  if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID not set");

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
          speed,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`ElevenLabs API error: ${response.status} ${await response.text()}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

// ── Convert MP3 to OGG (browser-compatible, lightweight) ────
async function convertToOgg(mp3Path) {
  const { execSync } = await import("child_process");
  const oggPath = mp3Path.replace(/\.mp3$/, ".ogg");
  try {
    execSync(
      `ffmpeg -y -i "${mp3Path}" -acodec libvorbis -ar 44100 -ac 2 -q:a 6 "${oggPath}"`,
      { stdio: "pipe" }
    );
    // Remove original MP3
    fs.unlinkSync(mp3Path);
    return oggPath;
  } catch {
    console.warn("  ⚠ ffmpeg not found — keeping MP3 (may not play in browser)");
    return mp3Path;
  }
}

// ── Get audio duration using ffprobe ─────────────────────────
async function getAudioDuration(filePath) {
  const { execSync } = await import("child_process");
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { encoding: "utf-8" }
    );
    return parseFloat(result.trim());
  } catch {
    console.warn("  ⚠ ffprobe not found — install ffmpeg for accurate duration detection");
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  const { lesson: lessonName, provider, voice, speed } = parseArgs();

  // Dynamic import of the lesson (compiled TS → we need to handle this)
  // Lessons are in TypeScript, so we load the raw file and extract narrations
  const lessonPath = path.join(__dirname, "..", "src", "lessons", `${lessonName}.ts`);

  if (!fs.existsSync(lessonPath)) {
    console.error(`Lesson file not found: ${lessonPath}`);
    process.exit(1);
  }

  // Parse narrations from the TypeScript file (simple regex extraction)
  const lessonContent = fs.readFileSync(lessonPath, "utf-8");
  const narrationRegex = /narration:\s*\n?\s*"([^"]+)"/g;
  const narrations = [];
  let match;
  while ((match = narrationRegex.exec(lessonContent)) !== null) {
    narrations.push(match[1].replace(/\\n/g, "\n"));
  }

  if (narrations.length === 0) {
    console.error("No narrations found in lesson file");
    process.exit(1);
  }

  // Create output directory
  const outputDir = path.join(AUDIO_DIR, lessonName);
  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`\n🎙  EU Funding School — TTS Generator`);
  console.log(`   Lesson: ${lessonName}`);
  console.log(`   Provider: ${provider}`);
  console.log(`   Slides with narration: ${narrations.length}`);
  console.log(`   Output: ${outputDir}\n`);

  const generate = provider === "elevenlabs" ? generateWithElevenLabs : generateWithOpenAI;

  // Check API key
  if (provider === "openai" && !process.env.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY not set. Add it to video/.env");
    console.error("   Copy .env.example to .env and fill in your key.");
    process.exit(1);
  }
  if (provider === "elevenlabs" && !process.env.ELEVENLABS_API_KEY) {
    console.error("❌ ELEVENLABS_API_KEY not set. Add it to video/.env");
    process.exit(1);
  }

  const manifest = [];

  for (let i = 0; i < narrations.length; i++) {
    const slideNum = String(i).padStart(2, "0");
    const outputFile = path.join(outputDir, `slide-${slideNum}.mp3`);
    const text = narrations[i];

    console.log(`   [${slideNum}] Generating audio (${text.length} chars)...`);

    try {
      await generate(text, outputFile, voice, speed);
      // Convert to OGG for browser compatibility (MP3 fails on this PC)
      const oggFile = await convertToOgg(outputFile);
      const isOgg = oggFile.endsWith(".ogg");
      const finalFile = isOgg ? `slide-${slideNum}.ogg` : `slide-${slideNum}.mp3`;
      const duration = await getAudioDuration(oggFile);
      const fileSize = (fs.statSync(oggFile).size / 1024).toFixed(1);

      manifest.push({
        slide: i,
        file: finalFile,
        duration,
        chars: text.length,
      });

      console.log(`         ✓ ${fileSize}KB ${isOgg ? "OGG" : "MP3"}${duration ? ` — ${duration.toFixed(1)}s` : ""}`);
    } catch (err) {
      console.error(`         ✗ Error: ${err.message}`);
      manifest.push({ slide: i, file: null, error: err.message });
    }
  }

  // Write manifest JSON (used by Remotion to load audio)
  const manifestPath = path.join(outputDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n   ✓ Manifest saved: ${manifestPath}`);

  // Summary
  const totalDuration = manifest.reduce((sum, s) => sum + (s.duration || 0), 0);
  const totalChars = manifest.reduce((sum, s) => sum + (s.chars || 0), 0);
  console.log(`\n   📊 Total: ${totalDuration.toFixed(1)}s audio, ${totalChars} characters`);
  console.log(`   💰 Estimated cost (OpenAI tts-1-hd): ~$${(totalChars / 1000000 * 30).toFixed(3)}\n`);
}

main().catch(console.error);
