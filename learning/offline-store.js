const DATABASE = "mina-teach-offline";
const DATABASE_VERSION = 1;
const STORE = "downloads";
const OWNER_KEY = "minaTeach.offline.owner.v1";
const OFFLINE_MODE_KEY = "minaTeach.offlineMode.v1";
const MAX_OWNER_BYTES = 40 * 1024 * 1024;

function assertOnlineDownloadAllowed() {
  let offlineMode = false;
  try { offlineMode = localStorage.getItem(OFFLINE_MODE_KEY) === "on"; } catch {}
  if (offlineMode) throw new Error("Turn off Offline Mode and reconnect before downloading new content.");
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("Connect to the internet to download new offline content.");
  }
}

function database() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) {
      reject(new Error("Offline storage is unavailable in this browser."));
      return;
    }
    const request = indexedDB.open(DATABASE, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Offline storage could not be opened."));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Offline storage could not be updated."));
    transaction.onabort = () => reject(transaction.error || new Error("Offline storage update was cancelled."));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Offline content could not be read."));
  });
}

function blobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => reject(reader.error || new Error("This image could not be prepared for offline use."));
    reader.readAsDataURL(blob);
  });
}

function safeOwner(value) {
  return typeof value === "string" && /^account:[A-Za-z0-9_-]{4,100}$/.test(value) ? value : "guest";
}

export function getOfflineOwner() {
  try { return safeOwner(localStorage.getItem(OWNER_KEY)); }
  catch { return "guest"; }
}

export function setOfflineOwner(owner) {
  const normalized = safeOwner(owner);
  try { localStorage.setItem(OWNER_KEY, normalized); }
  catch { /* The active page can still use this owner for the current session. */ }
  return normalized;
}

function compositeKey(owner, key) {
  return `${safeOwner(owner)}::${key}`;
}

async function allRecords(db) {
  const transaction = db.transaction(STORE, "readonly");
  const records = await requestResult(transaction.objectStore(STORE).getAll());
  await transactionDone(transaction);
  return records;
}

export async function saveOfflineDownload({ owner = getOfflineOwner(), key, type, title, responses = {}, data = null }) {
  if (typeof key !== "string" || !key || !["lesson", "question-set", "exam-result", "learning-state", "bookmarks"].includes(type)) {
    throw new Error("This offline download is not valid.");
  }
  const normalizedOwner = safeOwner(owner);
  const recordKey = compositeKey(normalizedOwner, key);
  const bytes = new TextEncoder().encode(JSON.stringify({ responses, data })).byteLength;
  if (bytes > MAX_OWNER_BYTES) throw new Error("This download exceeds the 40 MB offline storage limit.");
  const db = await database();
  try {
    const records = await allRecords(db);
    const used = records.filter(record => record.owner === normalizedOwner && record.key !== recordKey)
      .reduce((total, record) => total + (Number(record.bytes) || 0), 0);
    if (used + bytes > MAX_OWNER_BYTES) {
      throw new Error("Offline storage is full. Remove an existing download before adding this one; existing downloads were kept.");
    }
    const now = new Date().toISOString();
    const old = records.find(record => record.key === recordKey);
    const record = {
      key: recordKey,
      owner: normalizedOwner,
      resourceKey: key,
      type,
      title: String(title || key).slice(0, 180),
      bytes,
      createdAt: old?.createdAt || now,
      updatedAt: now,
      responses,
      data,
    };
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    await transactionDone(tx);
    return record;
  } finally {
    db.close();
  }
}

export async function listOfflineDownloads(owner = getOfflineOwner()) {
  const db = await database();
  try {
    return (await allRecords(db))
      .filter(record => record.owner === safeOwner(owner) && !["learning-state", "bookmarks"].includes(record.type))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .map(({ key, owner: _owner, resourceKey, type, title, bytes, createdAt, updatedAt, data }) =>
        ({ key, resourceKey, type, title, bytes, createdAt, updatedAt, data }));
  } finally {
    db.close();
  }
}

export async function getOfflineStorageUsage(owner = getOfflineOwner()) {
  const normalizedOwner = safeOwner(owner);
  const db = await database();
  let stored;
  try { stored = (await allRecords(db)).filter(record => record.owner === normalizedOwner); }
  finally { db.close(); }
  const records = stored.filter(record => !["learning-state", "bookmarks"].includes(record.type));
  return {
    bytes: stored.reduce((total, record) => total + (Number(record.bytes) || 0), 0),
    limitBytes: MAX_OWNER_BYTES,
    lessonCount: records.filter(record => record.type === "lesson").length,
    questionSetCount: records.filter(record => record.type === "question-set").length,
    resultCount: records.filter(record => record.type === "exam-result").length,
    downloadCount: records.length,
  };
}

export async function removeOfflineDownload(key, owner = getOfflineOwner()) {
  const db = await database();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(compositeKey(owner, key));
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

export async function clearOfflineOwner(owner) {
  const normalizedOwner = safeOwner(owner);
  const db = await database();
  try {
    const records = await allRecords(db);
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    records.filter(record => record.owner === normalizedOwner).forEach(record => store.delete(record.key));
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

export async function saveOfflineLearningState(state, owner = getOfflineOwner()) {
  const snapshot = JSON.parse(JSON.stringify(state || {}));
  return saveOfflineDownload({
    owner, key: "learning-state:v1", type: "learning-state",
    title: "Local learning progress and preferences",
    data: { state: snapshot },
  });
}

export async function getOfflineLearningState(owner = getOfflineOwner()) {
  const record = await getOfflineDownload("learning-state:v1", owner);
  return record?.type === "learning-state" && record.data?.state && typeof record.data.state === "object"
    ? record.data.state
    : null;
}

export async function saveOfflineBookmarks(bookmarks, owner = getOfflineOwner()) {
  if (!Array.isArray(bookmarks)) throw new Error("Offline bookmarks must be a list.");
  return saveOfflineDownload({
    owner, key: "exam-bookmarks:v1", type: "bookmarks",
    title: "Saved exam questions",
    data: { bookmarks: bookmarks.filter(item => item && typeof item.id === "string").slice(0, 500) },
  });
}

export async function getOfflineBookmarks(owner = getOfflineOwner()) {
  const record = await getOfflineDownload("exam-bookmarks:v1", owner);
  return record?.type === "bookmarks" && Array.isArray(record.data?.bookmarks) ? record.data.bookmarks : [];
}

export async function cachedApiResponse(path, owner = getOfflineOwner()) {
  const db = await database();
  try {
    const records = await allRecords(db);
    const record = records
      .filter(item => item.owner === safeOwner(owner) && item.responses && Object.hasOwn(item.responses, path))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    if (!record) return null;
    return structuredClone(record.responses[path]);
  } finally {
    db.close();
  }
}

export async function getOfflineDownload(key, owner = getOfflineOwner()) {
  const db = await database();
  try {
    return (await requestResult(db.transaction(STORE, "readonly").objectStore(STORE).get(compositeKey(owner, key)))) || null;
  } finally {
    db.close();
  }
}

export async function makeOfflineLessonDownload({ id, grade, subject, language = "en", owner = getOfflineOwner() }) {
  assertOnlineDownloadAllowed();
  const params = new URLSearchParams({ grade: String(grade), language });
  const courseParams = new URLSearchParams({ grade: String(grade), language, subject });
  const paths = [
    `/api/learning/catalog?${params}`,
    `/api/learning/course?${courseParams}`,
    `/api/learning/content/${encodeURIComponent(id)}`,
  ];
  const responses = {};
  const missingAssets = [];
  async function load(path) {
    const response = await fetch(path, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error?.message || "The server could not provide every part of this download.");
    }
    const data = await response.json();
    responses[path] = data;
    return data;
  }
  await load(paths[0]);
  const course = await load(paths[1]);
  const lessonResponse = await load(paths[2]);
  const lesson = lessonResponse.lesson;
  if (!lesson || Number(lesson.grade) !== Number(grade) || lesson.subject !== subject || lesson.language !== language) {
    throw new Error("The selected lesson no longer matches its grade, subject, and language.");
  }
  const outline = Array.isArray(lesson.materialOutline) ? lesson.materialOutline : [];
  for (let offset = 0; offset < outline.length; offset += 1) {
    const path = `/api/learning/content/${encodeURIComponent(id)}/materials?offset=${offset}&limit=1`;
    const page = await load(path);
    if (page.total !== outline.length || page.materials?.length !== 1 || page.materials[0].id !== outline[offset].id) {
      throw new Error("The lesson’s materials changed during download. No partial download was saved.");
    }
    const material = page.materials[0];
    if (material.type === "diagram" && typeof material.url === "string") {
      try {
        const assetUrl = new URL(material.url, location.origin);
        const asset = await fetch(assetUrl.href, { credentials: "omit", mode: "cors", cache: "no-store" });
        const blob = await asset.blob();
        if (!asset.ok || !blob.type.startsWith("image/") || blob.size > 4 * 1024 * 1024) {
          throw new Error("The diagram is unavailable or exceeds the offline image limit.");
        }
        material.offlineImageDataUrl = await blobAsDataUrl(blob);
        if (!material.offlineImageDataUrl) throw new Error("The diagram could not be embedded.");
      } catch {
        missingAssets.push(material.title || material.id);
      }
    }
    if (material.type === "resource" && /^https?:/i.test(material.url || "")) {
      missingAssets.push(material.title || material.id);
    }
  }
  if (!course.chapters?.some(chapter => chapter.lessons?.some(item => item.id === id))) {
    throw new Error("The lesson is not present in the selected course outline.");
  }
  const key = `lesson:${grade}:${language}:${id}`;
  return saveOfflineDownload({
    owner, key, type: "lesson", title: `Grade ${grade} · ${subject} · ${lesson.title}`,
    responses, data: { id, grade: Number(grade), subject, language, title: lesson.title, missingAssets },
  });
}

export async function makeOfflineCourseDownload({ grade, subject, language = "en", owner = getOfflineOwner(), onProgress = () => {} }) {
  assertOnlineDownloadAllowed();
  const params = new URLSearchParams({ grade: String(grade), language, subject });
  const response = await fetch(`/api/learning/course?${params}`, {
    credentials: "same-origin", cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message || "The subject outline could not be downloaded.");
  }
  const course = await response.json();
  const lessons = (course.chapters || []).flatMap(chapter => chapter.lessons || []);
  if (!lessons.length) throw new Error(`No published lessons are available for Grade ${grade} ${subject}.`);
  const errors = [];
  let completed = 0;
  for (const lesson of lessons) {
    try {
      await makeOfflineLessonDownload({ id: lesson.id, grade, subject, language, owner });
      completed += 1;
    } catch (error) {
      errors.push(`${lesson.title}: ${error.message}`);
    }
    onProgress({ completed, total: lessons.length, title: lesson.title });
    if (errors.some(message => message.includes("Offline storage is full"))) break;
  }
  return { completed, total: lessons.length, errors };
}

export async function makeOfflineGradeDownload({ grade, language = "en", owner = getOfflineOwner(), onProgress = () => {} }) {
  assertOnlineDownloadAllowed();
  const params = new URLSearchParams({ grade: String(grade), language });
  const response = await fetch(`/api/learning/catalog?${params}`, {
    credentials: "same-origin", cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message || "The grade catalog could not be downloaded.");
  }
  const catalog = await response.json();
  const subjects = catalog.subjects || [];
  if (!subjects.length) throw new Error(`No subject catalog is available for Grade ${grade}.`);
  let completed = 0;
  let total = 0;
  const errors = [];
  for (const subject of subjects) {
    try {
      const result = await makeOfflineCourseDownload({
        grade, subject: subject.name, language, owner,
        onProgress: progress => {
          onProgress({ subject: subject.name, ...progress });
        },
      });
      completed += result.completed;
      total += result.total;
      errors.push(...result.errors);
    } catch (error) {
      errors.push(`${subject.name}: ${error.message}`);
    }
    if (errors.some(message => message.includes("Offline storage is full"))) break;
  }
  return { completed, total, subjectCount: subjects.length, errors };
}

export function questionSetKey(selection, limit) {
  const normalized = {
    mode: selection.mode === "entrance" ? "entrance" : "practice",
    grade: selection.mode === "entrance" ? "" : String(selection.grade || ""),
    stream: selection.mode === "entrance" ? "" : String(selection.stream || ""),
    subject: selection.mode === "entrance" ? "" : String(selection.subject || ""),
    topic: selection.mode === "entrance" ? "" : String(selection.topic || ""),
    difficulty: selection.mode === "entrance" ? "" : String(selection.difficulty || ""),
    limit: String(limit),
  };
  return `questions:${new URLSearchParams(normalized)}`;
}

export async function saveOfflineQuestionSet(selection, limit, questions, owner = getOfflineOwner()) {
  if (!Array.isArray(questions) || questions.length < limit ||
    !questions.slice(0, limit).every(question => Array.isArray(question.choices) && question.choices.length === 4 &&
      Number.isInteger(question.correctIndex) && typeof question.explanation === "string")) {
    throw new Error("The downloaded questions are incomplete; no partial question set was saved.");
  }
  const selected = questions.slice(0, limit);
  return saveOfflineDownload({
    owner, key: questionSetKey(selection, limit), type: "question-set",
    title: `${selection.mode === "entrance" ? "Entrance practice" : `Grade ${selection.grade} ${selection.subject || "practice"}`} · ${limit} questions`,
    data: { selection, limit, questions: selected, official: false },
  });
}

export async function getOfflineQuestionSet(selection, limit, owner = getOfflineOwner()) {
  const record = await getOfflineDownload(questionSetKey(selection, limit), owner);
  return record?.data ? { ...record.data, offlineUpdatedAt: record.updatedAt } : null;
}

export async function saveOfflineExamResult(result, owner = getOfflineOwner()) {
  const key = `exam-result:${result.id}`;
  return saveOfflineDownload({
    owner, key, type: "exam-result",
    title: `${result.mode === "entrance" ? "Entrance" : "Practice"} result · ${result.score}/${result.total}`,
    data: { result, isResult: true },
  });
}

export async function listOfflineExamResults(owner = getOfflineOwner()) {
  const db = await database();
  try {
    const records = await allRecords(db);
    return records.filter(record => record.owner === safeOwner(owner) && record.type === "exam-result" && record.data?.isResult)
      .map(record => record.data.result).sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
  } finally {
    db.close();
  }
}

export function offlineDraftKey(owner = getOfflineOwner()) {
  return `mina-teach-active-exam-v2:${encodeURIComponent(safeOwner(owner))}`;
}
