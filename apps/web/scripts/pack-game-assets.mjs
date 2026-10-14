#!/usr/bin/env node
// Packs game-assets/DragonIsland.app into game-assets/dist/DragonIsland.zip using the
// `Payload/<name>.app/` layout that importContentArchive() accepts, so the dev/preview server can
// hand it to the content gate (see VITE_DIB_BUNDLED_ARCHIVE_URL in vite.config.ts).
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { zipSync } from "fflate";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const appDir = resolve(repositoryRoot, "game-assets/DragonIsland.app");
const outDir = resolve(repositoryRoot, "game-assets/dist");
const outFile = join(outDir, "DragonIsland.zip");

// The engine only reads these extensions (archivePackage.ts shouldReadEntry); anything else would
// just bloat the archive.
const readable = new Set([".plist", ".strings", ".png", ".fnt", ".m4a", ".mp3", ".wav", ".json", ".txt", ".csv"]);

// Core files the importer refuses to start without (asset-archive-spec.md §4). This is a quick
// preflight; `pnpm game:verify` runs the real importer for the full set of checks.
const required = [
  "Monsters.plist", "Combines.plist", "Jobs.plist", "Abilities.plist", "AbilityComponents.plist",
  "Info.plist", "Credits.plist", "Scale9Sprites.plist",
  "mainscreenBackground.png", "saveSlotBackground.png", "PopupMenuButton2-hd.png",
  "PopupBackgroundThin-hd.png", "ClerkGirl-hd.png", "TutorialRightSide-hd.png",
];
const requiredAudioStems = ["Opening1", "click"];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(appDir)
  .map((path) => relative(appDir, path).split(sep).join("/"))
  .filter((path) => readable.has(path.slice(path.lastIndexOf("."))))
  .sort();
const present = new Set(files);

const missing = required.filter((name) => !present.has(name));
for (const stem of requiredAudioStems) {
  if (![".m4a", ".mp3", ".wav"].some((ext) => present.has(stem + ext))) missing.push(`${stem}.(m4a|mp3|wav)`);
}
if (!present.has("en.lproj/Localizable.strings") && !present.has("Localizable.strings")) {
  missing.push("en.lproj/Localizable.strings");
}

const entries = {};
for (const path of files) {
  const lower = path.toLowerCase();
  // PNG and AAC/MP3 are already compressed; storing them keeps packing fast.
  const level = lower.endsWith(".png") || lower.endsWith(".m4a") || lower.endsWith(".mp3") ? 0 : 6;
  entries[`Payload/DragonIsland.app/${path}`] = [readFileSync(join(appDir, path)), { level }];
}
mkdirSync(outDir, { recursive: true });
const zip = zipSync(entries);
writeFileSync(outFile, zip);

console.log(`Packed ${files.length} files (${(zip.byteLength / 1048576).toFixed(1)} MiB) -> ${relative(repositoryRoot, outFile)}`);
if (missing.length > 0) {
  console.warn(`\nThe engine will reject this archive until these files are added to game-assets/DragonIsland.app:`);
  for (const name of missing) console.warn(`  - ${name}`);
  if (process.argv.includes("--strict")) process.exitCode = 1;
}
