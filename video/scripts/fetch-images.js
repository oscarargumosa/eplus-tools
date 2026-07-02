/**
 * EU Funding School — Image Fetcher
 *
 * Downloads high-quality images from Unsplash for lesson slides.
 * Uses the free Unsplash API (50 req/hour without key, or unlimited with key).
 *
 * Usage:
 *   node scripts/fetch-images.js --query "european students collaboration" --count 5
 *   node scripts/fetch-images.js --query "university classroom" --out ka-lines
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.join(__dirname, "..", "public", "images");

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    query: null,
    count: 5,
    out: "general",
    orientation: "landscape",
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--query" && args[i + 1]) parsed.query = args[++i];
    if (args[i] === "--count" && args[i + 1]) parsed.count = parseInt(args[++i]);
    if (args[i] === "--out" && args[i + 1]) parsed.out = args[++i];
    if (args[i] === "--orientation" && args[i + 1]) parsed.orientation = args[++i];
  }

  if (!parsed.query) {
    console.error("Usage: node scripts/fetch-images.js --query <search terms> [--count N] [--out folder]");
    console.error("");
    console.error("Examples:");
    console.error('  --query "european students erasmus"');
    console.error('  --query "university classroom collaboration" --count 8');
    console.error('  --query "european parliament politics" --out ka3');
    process.exit(1);
  }

  return parsed;
}

async function searchUnsplash(query, count, orientation) {
  // Unsplash free API (no key required for source URLs)
  // For search API we use the public endpoint
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${count}&orientation=${orientation}&content_filter=high`;

  // Try with API key first, fallback to direct source URLs
  const apiKey = process.env.UNSPLASH_ACCESS_KEY;

  if (apiKey) {
    const response = await fetch(url, {
      headers: { Authorization: `Client-ID ${apiKey}` },
    });
    if (response.ok) {
      const data = await response.json();
      return data.results.map((photo) => ({
        id: photo.id,
        url: photo.urls.regular, // 1080px wide
        urlFull: photo.urls.full,
        description: photo.description || photo.alt_description || query,
        author: photo.user.name,
        authorUrl: photo.user.links.html,
      }));
    }
  }

  // Fallback: use Unsplash source (no API key needed, random images)
  console.log("  ℹ No UNSPLASH_ACCESS_KEY set — using source URLs (random, no search)");
  console.log("  ℹ Get a free key at https://unsplash.com/developers\n");

  return Array.from({ length: count }, (_, i) => ({
    id: `random-${i}`,
    url: `https://source.unsplash.com/1920x1080/?${encodeURIComponent(query)}&sig=${Date.now() + i}`,
    description: query,
    author: "Unsplash",
    authorUrl: "https://unsplash.com",
  }));
}

async function downloadImage(url, filepath) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(filepath, buffer);
  return buffer.length;
}

async function main() {
  const { query, count, out, orientation } = parseArgs();
  const outputDir = path.join(IMAGES_DIR, "lessons", out);
  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`\n🖼  EU Funding School — Image Fetcher`);
  console.log(`   Query: "${query}"`);
  console.log(`   Count: ${count}`);
  console.log(`   Output: ${outputDir}\n`);

  const photos = await searchUnsplash(query, count, orientation);

  const manifest = [];

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const filename = `img-${String(i).padStart(2, "0")}.jpg`;
    const filepath = path.join(outputDir, filename);

    console.log(`   [${i}] Downloading: ${photo.description?.slice(0, 50)}...`);

    try {
      const size = await downloadImage(photo.url, filepath);
      manifest.push({
        index: i,
        file: filename,
        description: photo.description,
        author: photo.author,
        authorUrl: photo.authorUrl,
        size,
      });
      console.log(`       ✓ ${(size / 1024).toFixed(0)}KB`);
    } catch (err) {
      console.error(`       ✗ ${err.message}`);
    }
  }

  // Save manifest
  const manifestPath = path.join(outputDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`\n   ✓ ${manifest.length} images saved`);
  console.log(`   ✓ Manifest: ${manifestPath}`);
  console.log(`\n   Use in slides: staticFile("images/lessons/${out}/img-00.jpg")\n`);
}

main().catch(console.error);
