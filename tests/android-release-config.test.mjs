import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Android TWA uses the owner-approved identity and existing production origin", async () => {
  const config = JSON.parse(await read("android/twa-manifest.json"));
  assert.equal(config.packageId, "com.minateach.minateachai");
  assert.equal(config.host, "mina-teach-entrance.replit.app");
  assert.equal(config.name, "MINA TEACH AI");
  assert.equal(config.launcherName, "MINA TEACH");
  assert.equal(config.appVersion, "1.0.0");
  assert.equal(config.appVersionCode, 1);
  assert.equal(new URL(config.webManifestUrl).host, config.host);
  assert.equal(config.enableNotifications, false);
  assert.deepEqual(config.fingerprints, []);
  assert.equal(config.features.playBilling, undefined);
  assert.equal(config.features.locationDelegation, undefined);
});

test("store preparation discloses the exact slogan and current account deletion limits", async () => {
  const [privacy, listing, safety, checklist] = await Promise.all([
    read("privacy/index.html"),
    read("play-store/listing.md"),
    read("play-store/data-safety-draft.md"),
    read("play-store/release-checklist.md"),
  ]);
  for (const text of [privacy, listing]) assert.match(text, /Dhaloota beekumsa omishuudha\./);
  for (const text of [privacy, safety, checklist]) {
    assert.match(text, /Clerk/);
    assert.match(text, /exam attempts/);
    assert.match(text, /bookmarks/);
  }
  assert.match(privacy, /minaseyfufa@gmail\.com/);
  assert.match(checklist, /Digital Asset Links/);
  assert.match(checklist, /does not submit the app/);
});
