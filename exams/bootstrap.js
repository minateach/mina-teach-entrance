import {
  getOfflineOwner,
  getOfflineQuestionSet,
  listOfflineDownloads,
  listOfflineExamResults,
  removeOfflineDownload,
  saveOfflineExamResult,
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
function readBookmarks() {
  try {
    const value = JSON.parse(localStorage.getItem(ownerKey()) || "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
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
  localStorage.setItem(ownerKey(), JSON.stringify(bookmarks));
  return index < 0;
}

window.MinaOffline = {
  getOfflineOwner,
  getOfflineQuestionSet,
  listOfflineDownloads,
  listOfflineExamResults,
  removeOfflineDownload,
  saveOfflineExamResult,
  saveOfflineQuestionSet,
  offlineDraftKey,
  readBookmarks,
  toggleBookmark,
};

await import("./app.js");
