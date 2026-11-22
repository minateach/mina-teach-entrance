import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { ConsoleLog, TwaGenerator, TwaManifest } from "@bubblewrap/core";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const androidDir = resolve(root, "android");
const manifestPath = resolve(androidDir, "twa-manifest.json");
const manifest = await TwaManifest.fromFile(manifestPath);
const manifestProblem = manifest.validate();
if (manifestProblem) throw new Error(`Invalid Android TWA configuration: ${manifestProblem}`);
if (manifest.packageId !== "com.minateach.minateachai") {
  throw new Error("The Android package ID differs from the owner-approved ID.");
}
if (manifest.name !== "MINA TEACH AI" || manifest.launcherName !== "MINA TEACH") {
  throw new Error("The Android app name or launcher name does not match the approved branding.");
}
if (!manifest.webManifestUrl || manifest.webManifestUrl.host !== manifest.host) {
  throw new Error("The Android origin and web manifest origin must match.");
}
if (manifest.enableNotifications || manifest.features.playBilling || manifest.features.locationDelegation) {
  throw new Error("Unexpected Android permissions or paid features are enabled.");
}

const output = new TwaGenerator();
await output.createTwaProject(androidDir, manifest, new ConsoleLog("MINA TEACH AI Android"));

// Keep the first-launch splash aligned with the approved name and exact slogan.
const splashText = Buffer.from(`
  <svg width="1200" height="1200" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="1200" fill="#101D45"/>
    <circle cx="600" cy="450" r="188" fill="#16366f"/>
    <circle cx="600" cy="450" r="176" fill="#ffffff"/>
    <text x="600" y="435" text-anchor="middle" font-family="Arial, sans-serif" font-size="104" font-weight="700" fill="#123B70">MINA</text>
    <text x="600" y="540" text-anchor="middle" font-family="Arial, sans-serif" font-size="82" font-weight="700" fill="#0786d1">TEACH AI</text>
    <path d="M300 690h600" stroke="#8ec9ff" stroke-width="8" stroke-linecap="round"/>
    <text x="600" y="790" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" fill="#ffffff">Dhaloota beekumsa omishuudha.</text>
  </svg>
`);
const splash = await sharp(splashText).png().toBuffer();
const splashSizes = [
  ["drawable-mdpi", 300],
  ["drawable-hdpi", 450],
  ["drawable-xhdpi", 600],
  ["drawable-xxhdpi", 900],
  ["drawable-xxxhdpi", 1200],
];
for (const [directory, size] of splashSizes) {
  const file = resolve(androidDir, `app/src/main/res/${directory}/splash.png`);
  await sharp(splash).resize(size, size).png().toFile(file);
}

const androidManifestPath = resolve(androidDir, "app/src/main/AndroidManifest.xml");
const androidManifest = await readFile(androidManifestPath, "utf8");
await writeFile(androidManifestPath, androidManifest.replace('android:allowBackup="true"', 'android:allowBackup="false"'));
await manifest.saveToFile(manifestPath);
const manifestBytes = await readFile(manifestPath);
await writeFile(resolve(androidDir, "manifest-checksum.txt"), createHash("sha1").update(manifestBytes).digest("hex"));
console.log(`Prepared ${manifest.name} (${manifest.packageId}) for ${manifest.host}.`);
console.log("No signing key, password, Play submission, or Digital Asset Links certificate was created.");
