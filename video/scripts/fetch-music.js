/**
 * EU Funding School — Music Library Builder
 *
 * Downloads royalty-free music from Pixabay for video backgrounds.
 * Pixabay music is free for commercial use, no attribution required.
 *
 * Usage:
 *   node scripts/fetch-music.js --query "corporate inspirational" --count 3
 *   node scripts/fetch-music.js --query "ambient calm" --mood calm
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MUSIC_DIR = path.join(__dirname, "..", "public", "audio", "music");

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    query: "corporate inspirational",
    count: 3,
    mood: "corporate",
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--query" && args[i + 1]) parsed.query = args[++i];
    if (args[i] === "--count" && args[i + 1]) parsed.count = parseInt(args[++i]);
    if (args[i] === "--mood" && args[i + 1]) parsed.mood = args[++i];
  }

  return parsed;
}

async function searchPixabayMusic(query, count) {
  const apiKey = process.env.PIXABAY_API_KEY;

  if (!apiKey) {
    console.log("  ⚠ No PIXABAY_API_KEY set.");
    console.log("  ℹ Get a free key at https://pixabay.com/api/docs/");
    console.log("");
    console.log("  Alternatively, download music manually from:");
    console.log("    - https://pixabay.com/music/search/corporate%20inspirational/");
    console.log("    - https://mixkit.co/free-stock-music/corporate/");
    console.log("    - https://www.bensound.com/royalty-free-music/corporate");
    console.log("");
    console.log("  Place MP3 files in: public/audio/music/");
    console.log("  Naming convention: bg-{mood}.mp3 (e.g., bg-corporate.mp3)");
    return [];
  }

  const url = `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&media_type=music&per_page=${count}&safesearch=true`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Pixabay API error: ${response.status}`);

  const data = await response.json();
  return data.hits.map((track) => ({
    id: track.id,
    url: track.audio,
    title: track.tags,
    duration: track.duration,
    user: track.user,
  }));
}

async function downloadTrack(url, filepath) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(filepath, buffer);
  return buffer.length;
}

async function main() {
  const { query, count, mood } = parseArgs();
  fs.mkdirSync(MUSIC_DIR, { recursive: true });

  console.log(`\n🎵  EU Funding School — Music Library`);
  console.log(`   Query: "${query}"`);
  console.log(`   Mood: ${mood}`);
  console.log(`   Output: ${MUSIC_DIR}\n`);

  const tracks = await searchPixabayMusic(query, count);

  if (tracks.length === 0) {
    console.log("   No tracks found or no API key. Download manually.\n");
    return;
  }

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const filename = `bg-${mood}-${String(i).padStart(2, "0")}.mp3`;
    const filepath = path.join(MUSIC_DIR, filename);

    console.log(`   [${i}] ${track.title?.slice(0, 40)} (${track.duration}s)...`);

    try {
      const size = await downloadTrack(track.url, filepath);
      console.log(`       ✓ ${(size / 1024).toFixed(0)}KB → ${filename}`);
    } catch (err) {
      console.error(`       ✗ ${err.message}`);
    }
  }

  console.log(`\n   Use in lesson: musicTrack: "music/bg-${mood}-00.mp3"\n`);
}

main().catch(console.error);
