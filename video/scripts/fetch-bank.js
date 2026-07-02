/**
 * EU Funding School — Image Bank Fetcher (Pexels)
 *
 * Builds a large local image bank organised by theme, so videos can pull
 * UNIQUE images (no repeats within a presentation). Pro-quality, curated.
 *
 * Usage:
 *   node scripts/fetch-bank.js                 # fetch all default themes
 *   node scripts/fetch-bank.js --theme youth   # one theme only
 *   node scripts/fetch-bank.js --count 50      # images per theme
 *
 * Requires PEXELS_API_KEY in video/.env
 * Output: public/images/bank/<theme>/pexels-<id>.jpg + bank manifest.json
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BANK_DIR = path.join(__dirname, "..", "public", "images", "bank");

// Theme → Pexels search query. Add themes here as videos need them.
const THEMES = {
  youth: "diverse young people group happy together",
  europe: "european union institution flag building",
  travel: "young people travel airport study abroad",
  collaboration: "business team meeting collaboration office",
  politics: "government parliament meeting debate hall",
  education: "students university classroom learning",
  support: "young people talking conversation community support",
  rural: "rural countryside village europe landscape",
};

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { theme: null, count: 40 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--theme" && args[i + 1]) parsed.theme = args[++i];
    if (args[i] === "--count" && args[i + 1]) parsed.count = parseInt(args[++i], 10);
  }
  return parsed;
}

async function searchPexels(query, count) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) {
    console.error("❌ PEXELS_API_KEY not set in video/.env");
    process.exit(1);
  }
  const perPage = Math.min(count, 80);
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(
    query
  )}&per_page=${perPage}&orientation=landscape&size=large`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const data = await res.json();
  return data.photos.map((p) => ({ id: p.id, url: p.src.landscape }));
}

async function download(url, filepath) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  fs.writeFileSync(filepath, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const { theme, count } = parseArgs();
  const themes = theme ? { [theme]: THEMES[theme] || theme } : THEMES;

  fs.mkdirSync(BANK_DIR, { recursive: true });
  const manifestPath = path.join(BANK_DIR, "manifest.json");
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
    : {};

  console.log(`\n🖼  Image Bank Fetcher (Pexels)\n`);

  for (const [name, query] of Object.entries(themes)) {
    const dir = path.join(BANK_DIR, name);
    fs.mkdirSync(dir, { recursive: true });
    console.log(`   [${name}] "${query}"`);

    let photos;
    try {
      photos = await searchPexels(query, count);
    } catch (err) {
      console.error(`      ✗ search failed: ${err.message}`);
      continue;
    }

    const files = [];
    for (const photo of photos) {
      const rel = `images/bank/${name}/pexels-${photo.id}.jpg`;
      const abs = path.join(__dirname, "..", "public", rel);
      try {
        if (!fs.existsSync(abs)) await download(photo.url, abs);
        files.push(rel);
      } catch (err) {
        console.error(`      ✗ ${photo.id}: ${err.message}`);
      }
    }
    manifest[name] = files;
    console.log(`      ✓ ${files.length} images`);
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const total = Object.values(manifest).reduce((n, a) => n + a.length, 0);
  console.log(`\n   ✓ Bank manifest: ${manifestPath}`);
  console.log(`   📦 ${total} images across ${Object.keys(manifest).length} themes\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
