import {
  getOfflineOwner,
  getOfflineBookmarks,
  getOfflineQuestionSet,
  listOfflineDownloads,
  listOfflineExamResults,
  removeOfflineDownload,
  saveOfflineExamResult,
  saveOfflineBookmarks,
  saveOfflineQuestionSet,
  setOfflineOwner,
  offlineDraftKey,
} from "../learning/offline-store.js";

try {
  const response = await fetch("/api/account/status", { credentials: "same-origin" });
  const status = await response.json();
  if (response.ok && status.signedIn && status.userId) setOfflineOwner(`account:${status.userId}`);
  else if (response.ok) setOfflineOwner("guest");
} catch {
  // The last account scope is used only for this device's saved downloads and drafts.
}

const ownerKey = () => `minaTeach.exam.bookmarks.v1:${encodeURIComponent(getOfflineOwner())}`;
let bookmarkMemory = [];
function readBookmarks() {
  try {
    const value = JSON.parse(localStorage.getItem(ownerKey()) || "[]");
    if(Array.isArray(value)){bookmarkMemory=value;return value;}
  } catch {}
  return bookmarkMemory;
}
function toggleBookmark(question) {
  const bookmarks = readBookmarks();
  const id = String(question.id);
  const index = bookmarks.findIndex(item => String(item.id) === id);
  if (index >= 0) bookmarks.splice(index, 1);
  else bookmarks.unshift({
    id, grade: question.grade, subject: question.subject, prompt: question.prompt,
    choices: question.choices, correctIndex: question.correctIndex, explanation: question.explanation,
    sourceLabel: question.sourceLabel, savedAt: new Date().toISOString(),
  });
  bookmarkMemory=bookmarks;
  try { localStorage.setItem(ownerKey(), JSON.stringify(bookmarks)); } catch {}
  void saveOfflineBookmarks(bookmarks).catch(()=>{});
  return index < 0;
}

const localBookmarks=readBookmarks(),backupBookmarks=await getOfflineBookmarks().catch(()=>[]);
bookmarkMemory=[...new Map([...backupBookmarks,...localBookmarks].map(item=>[String(item.id),item])).values()];
try { localStorage.setItem(ownerKey(),JSON.stringify(bookmarkMemory)); } catch {}
void saveOfflineBookmarks(bookmarkMemory).catch(()=>{});

window.MinaOffline = {
  getOfflineOwner,
  getOfflineQuestionSet,
  listOfflineDownloads,
  listOfflineExamResults,
  removeOfflineDownload,
  saveOfflineExamResult,
  saveOfflineBookmarks,
  saveOfflineQuestionSet,
  offlineDraftKey,
  readBookmarks,
  toggleBookmark,
};

await import("./app.js");
