import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const files=Object.fromEntries(await Promise.all([
  ["privacy", "privacy/index.html"],
  ["terms", "terms/index.html"],
  ["home", "index.html"],
  ["account", "account/src/main.jsx"],
  ["server", "server.mjs"],
  ["runbook", "replit.md"],
].map(async([key,path])=>[key,await readFile(new URL(`../${path}`,import.meta.url),"utf8")])));

test("privacy and terms pages are public, linked, and have accessible main headings",()=>{
  assert.match(files.server,/pathname === \"\/terms\" \|\| pathname === \"\/terms\/\"/);
  for(const [key,page] of [["privacy",files.privacy],["terms",files.terms]]) {
    assert.match(page,/<html lang=\"en\">/);
    assert.match(page,/<main id=\"main\">/);
    assert.match(page,/<h1>/);
    assert.match(page,/class=\"skip-link\" href=\"#main\"/);
    assert.match(page,/aria-label=\"Policy pages\"/);
    assert.match(page,/href=\"\/privacy\/\"/);
    assert.match(page,/href=\"\/terms\/\"/);
    assert.match(page,/mailto:minaseyfufa@gmail\.com/);
    assert.ok(page.includes("not legal advice")||page.includes("not legal certification"),`${key} explains its draft status`);
  }
  assert.match(files.home,/href=\"\/privacy\/\"/);
  assert.match(files.home,/href=\"\/terms\/\"/);
  assert.match(files.account,/href=\"\/privacy\/\"/);
  assert.match(files.account,/href=\"\/terms\/\"/);
  assert.match(files.account,/className=\"auth-policy-links\"/);
});

test("account export and deletion wording matches implemented record coverage",()=>{
  assert.match(files.account,/exportData\s*=\s*\(\)\s*=>/);
  assert.match(files.account,/exportedAt:[\s\S]*?profile:[\s\S]*?records/);
  assert.match(files.account,/minaTeach\.studyNotifications\.v1:/);
  assert.match(files.account,/minaTeach\.studyNoticeFeed\.v1:/);
  assert.match(files.account,/minaTeach\.studyReminder\.lastDay:/);
  assert.match(files.account,/clearOfflineOwner\(offlineOwner\)/);
  assert.match(files.account,/deleteLocalAssistantImages\(\)/);
  assert.match(files.account,/separately stored online exam attempts and question bookmarks remain/);
  assert.match(files.server,/DELETE FROM mina_user_records WHERE user_id = \$1/);
  assert.doesNotMatch(files.server,/DELETE FROM mina_exam_attempts WHERE user_id/);
  assert.doesNotMatch(files.server,/DELETE FROM mina_question_bookmarks WHERE user_id = \$1/);
  assert.match(files.privacy,/does <strong>not<\/strong> delete your Clerk sign-in identity/);
  assert.match(files.privacy,/separately stored online exam-attempt and question-bookmark records/);
  assert.match(files.privacy,/does not include separately stored online exam attempts or question bookmarks/);
});

test("privacy language matches provider, device-storage, and current notification behavior",()=>{
  for(const phrase of [
    "Clerk handles sign-in identity",
    "Replit PostgreSQL",
    "MiniMax service",
    "Google Gemini",
    "Google Search grounding",
    "device-only downloads and image attachments",
    "Background push notifications are not configured",
    "The current app code does not include Google Analytics, Firebase Analytics, Firebase Crashlytics, or advertising SDKs",
  ])assert.ok(files.privacy.includes(phrase),`privacy policy includes accurate behavior: ${phrase}`);
  assert.match(files.terms,/AI responses can be incomplete or incorrect/);
  assert.match(files.terms,/not official Ethiopian Ministry of Education material/);
  assert.match(files.terms,/current deletion control does not delete/);
});

test("recovery notes describe Replit options without claiming backups are enabled",()=>{
  assert.match(files.runbook,/Development data:[\s\S]*?no separate development-database backup/);
  assert.match(files.runbook,/whole project\s+back to an Agent\s+checkpoint/);
  assert.match(files.runbook,/point-in-time recovery \(PITR\) as enabled[\s\S]*?7-day recovery window/);
  assert.match(files.runbook,/optional scheduled daily snapshots/i);
  assert.match(files.runbook,/cannot see whether production snapshots are enabled/);
  assert.match(files.runbook,/restoring production replaces live data/);
  assert.match(files.runbook,/irreversible; changes made after that point are lost/);
  assert.match(files.runbook,/docs\.replit\.com\/features\/data-and-storage\/data-recovery/);
  assert.doesNotMatch(files.runbook,/CREATE TABLE.*backup|pg_dump|database dump job/i);
});
