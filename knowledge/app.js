const elements = {
  accountNotice: document.getElementById("account-notice"),
  uploadForm: document.getElementById("upload-form"),
  fileInput: document.getElementById("file-input"),
  uploadButton: document.getElementById("upload-button"),
  uploadStatus: document.getElementById("upload-status"),
  searchInput: document.getElementById("search-input"),
  categoryFilter: document.getElementById("category-filter"),
  storageUsage: document.getElementById("storage-usage"),
  libraryStatus: document.getElementById("library-status"),
  documentList: document.getElementById("document-list"),
  sharedPanel: document.getElementById("shared-admin-panel"),
  sharedUploadForm: document.getElementById("shared-upload-form"),
  sharedFileInput: document.getElementById("shared-file-input"),
  sharedUploadButton: document.getElementById("shared-upload-button"),
  sharedUploadStatus: document.getElementById("shared-upload-status"),
  sharedSearchInput: document.getElementById("shared-search-input"),
  sharedStorageUsage: document.getElementById("shared-storage-usage"),
  sharedLibraryStatus: document.getElementById("shared-library-status"),
  sharedDocumentList: document.getElementById("shared-document-list"),
};

let signedIn = false;
let isAdmin = false;
let documents = [];
let sharedDocuments = [];
let searchTimer;
let sharedSearchTimer;

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", ...options });
  const body = response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : null;
  if (!response.ok) {
    const error = new Error(body?.error?.message || "The request could not be completed.");
    error.code = body?.error?.code || "";
    error.status = response.status;
    throw error;
  }
  return body;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function statusLabel(document) {
  if (document.processingStatus === "ready") {
    const recordCount = Number.isInteger(document.metadata?.records) ? ` · ${document.metadata.records} records` : "";
    return `${document.extractedCharacters.toLocaleString()} searchable characters${document.pageCount ? ` · ${document.pageCount} pages` : ""}${recordCount}`;
  }
  if (document.processingStatus === "needs_ocr") return "Stored · no selectable text found";
  if (document.processingStatus === "available_for_ai") return "Image · stored, not text-indexed";
  return document.processingNotice || "Stored · searchable text is not available";
}

function addNode(parent, tagName, className, text = "") {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text) node.textContent = text;
  parent.append(node);
  return node;
}

function renderDocumentCard(documentItem, shared = false) {
  const item = document.createElement("li");
  item.className = "document-card";
  const icon = addNode(item, "span", "file-icon", documentItem.mimeType === "application/pdf" ? "PDF" :
    documentItem.mimeType === "application/x-ndjson" ? "JSONL" :
    documentItem.mimeType.startsWith("image/") ? "IMG" : "DOC");
  icon.setAttribute("aria-hidden", "true");

  const details = addNode(item, "div", "document-details");
  addNode(details, "h3", "document-title", documentItem.displayName);
  addNode(details, "p", "document-meta", `${documentItem.category} · ${formatBytes(documentItem.byteSize)}`);
  const metadata = documentItem.metadata && typeof documentItem.metadata === "object" ? documentItem.metadata : {};
  const classification = [
    metadata.grade ? `Grade ${metadata.grade}` : "",
    metadata.language ? `Language ${metadata.language}` : "",
    Array.isArray(metadata.topics) && metadata.topics.length ? `${metadata.topics.slice(0, 4).join(", ")}` : "",
    Number.isInteger(metadata.records) ? `${metadata.records} structured records` : "",
  ].filter(Boolean).join(" · ");
  if (classification) addNode(details, "p", "document-classification", classification);
  if (documentItem.summary) addNode(details, "p", "document-summary", documentItem.summary);
  const status = addNode(details, "p", `document-status status-${documentItem.processingStatus}`, statusLabel(documentItem));
  status.setAttribute("title", documentItem.processingNotice || "");
  if (documentItem.processingNotice) addNode(details, "p", "document-notice", documentItem.processingNotice);

  const actions = addNode(item, "div", "document-actions");
  const open = document.createElement("a");
  open.className = "small-button";
  const routeBase = shared ? "/api/knowledge/shared/documents" : "/api/knowledge/documents";
  open.href = `${routeBase}/${encodeURIComponent(documentItem.id)}/file`;
  open.target = "_blank";
  open.rel = "noopener noreferrer";
  open.textContent = "Open";
  open.setAttribute("aria-label", `Open ${documentItem.displayName}`);
  actions.append(open);

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "small-button";
  editButton.textContent = "Edit";
  editButton.setAttribute("aria-label", `Rename or categorize ${documentItem.displayName}`);
  editButton.addEventListener("click", () => renderEditForm(item, documentItem, shared));
  actions.append(editButton);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "small-button danger-button";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => deleteDocument(documentItem, shared));
  actions.append(deleteButton);
  return item;
}

function renderEditForm(card, documentItem, shared = false) {
  card.querySelector(".document-edit-form")?.remove();
  const form = document.createElement("form");
  form.className = "document-edit-form";

  const nameLabel = addNode(form, "label", "", "File name");
  const nameInput = document.createElement("input");
  nameInput.required = true;
  nameInput.maxLength = 180;
  nameInput.value = documentItem.displayName;
  nameLabel.append(nameInput);

  const categoryLabel = addNode(form, "label", "", "Folder or category");
  const categoryInput = document.createElement("input");
  categoryInput.maxLength = 80;
  categoryInput.value = documentItem.category;
  categoryLabel.append(categoryInput);

  const buttons = addNode(form, "div", "edit-actions");
  const save = addNode(buttons, "button", "small-button primary-small", "Save");
  save.type = "submit";
  const cancel = addNode(buttons, "button", "small-button", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", () => form.remove());
  form.addEventListener("submit", async event => {
    event.preventDefault();
    save.disabled = true;
    try {
      const routeBase = shared ? "/api/knowledge/shared/documents" : "/api/knowledge/documents";
      await api(`${routeBase}/${encodeURIComponent(documentItem.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: nameInput.value, category: categoryInput.value }),
      });
      await (shared ? loadSharedDocuments() : loadDocuments());
    } catch (error) {
      setLibraryStatus(error.message, "error");
      save.disabled = false;
    }
  });
  card.append(form);
  nameInput.focus();
}

async function deleteDocument(documentItem, shared = false) {
  if (!window.confirm(`Delete “${documentItem.displayName}” and its searchable text${shared ? " for all students" : ""}? This cannot be undone.`)) return;
  try {
    const routeBase = shared ? "/api/knowledge/shared/documents" : "/api/knowledge/documents";
    await api(`${routeBase}/${encodeURIComponent(documentItem.id)}`, { method: "DELETE" });
    await (shared ? loadSharedDocuments() : loadDocuments());
  } catch (error) {
    setLibraryStatus(error.message, "error");
  }
}

function renderCategories() {
  const previous = elements.categoryFilter.value;
  const categories = [...new Set(documents.map(item => item.category))].sort((a, b) => a.localeCompare(b));
  elements.categoryFilter.replaceChildren(new Option("All categories", ""));
  categories.forEach(category => elements.categoryFilter.add(new Option(category, category)));
  elements.categoryFilter.value = categories.includes(previous) ? previous : "";
}

function renderDocuments() {
  const category = elements.categoryFilter.value;
  const visible = documents.filter(item => !category || item.category === category);
  elements.documentList.replaceChildren();
  visible.forEach(item => elements.documentList.append(renderDocumentCard(item)));
  if (!documents.length) {
    elements.libraryStatus.textContent = "Your library is empty. Upload a file to start building your private knowledge collection.";
    elements.libraryStatus.hidden = false;
  } else if (!visible.length) {
    elements.libraryStatus.textContent = "No files match this category.";
    elements.libraryStatus.hidden = false;
  } else {
    elements.libraryStatus.hidden = true;
  }
  const totalBytes = documents.reduce((sum, item) => sum + item.byteSize, 0);
  elements.storageUsage.textContent = `${documents.length} / 20 files · ${formatBytes(totalBytes)} / 20 MB`;
  const percent = Math.min(100, Math.round(totalBytes / (20 * 1024 * 1024) * 100));
  elements.storageUsage.setAttribute("aria-label", `${percent} percent of Knowledge Center storage used`);
}

function renderSharedDocuments() {
  elements.sharedDocumentList.replaceChildren();
  sharedDocuments.forEach(item => elements.sharedDocumentList.append(renderDocumentCard(item, true)));
  if (!sharedDocuments.length) {
    elements.sharedLibraryStatus.hidden = false;
    elements.sharedLibraryStatus.textContent = "No shared source files match this search. Upload a verified source or JSONL record file to begin.";
  } else {
    elements.sharedLibraryStatus.hidden = true;
  }
  const totalBytes = sharedDocuments.reduce((sum, item) => sum + item.byteSize, 0);
  elements.sharedStorageUsage.textContent = `${sharedDocuments.length} / 20 files · ${formatBytes(totalBytes)} / 20 MB`;
  const percent = Math.min(100, Math.round(totalBytes / (20 * 1024 * 1024) * 100));
  elements.sharedStorageUsage.setAttribute("aria-label", `${percent} percent of shared Knowledge Center storage used`);
}

function setLibraryStatus(message, state = "info") {
  elements.libraryStatus.hidden = false;
  elements.libraryStatus.dataset.state = state;
  elements.libraryStatus.textContent = message;
}

async function loadDocuments() {
  if (!signedIn) return;
  setLibraryStatus("Loading your private files…");
  try {
    const query = elements.searchInput.value.trim();
    const result = await api(`/api/knowledge/documents${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    documents = Array.isArray(result.documents) ? result.documents : [];
    renderCategories();
    renderDocuments();
  } catch (error) {
    documents = [];
    elements.documentList.replaceChildren();
    setLibraryStatus(error.message, "error");
  }
}

function setSharedStatus(message, state = "info") {
  elements.sharedLibraryStatus.hidden = false;
  elements.sharedLibraryStatus.dataset.state = state;
  elements.sharedLibraryStatus.textContent = message;
}

async function loadSharedDocuments() {
  if (!signedIn || !isAdmin) return;
  setSharedStatus("Searching shared source files…");
  try {
    const query = elements.sharedSearchInput.value.trim();
    const result = await api(`/api/knowledge/shared/documents${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    sharedDocuments = Array.isArray(result.documents) ? result.documents : [];
    renderSharedDocuments();
  } catch (error) {
    sharedDocuments = [];
    elements.sharedDocumentList.replaceChildren();
    setSharedStatus(error.message, "error");
  }
}

async function checkAccount() {
  try {
    const status = await api("/api/account/status");
    signedIn = status.signedIn === true;
    isAdmin = status.role === "admin";
  } catch {
    signedIn = false;
    isAdmin = false;
  }
  elements.uploadButton.disabled = !signedIn || !elements.fileInput.files?.length;
  elements.fileInput.disabled = !signedIn;
  elements.sharedPanel.hidden = !isAdmin;
  elements.sharedFileInput.disabled = !isAdmin;
  elements.sharedUploadButton.disabled = !isAdmin;
  if (!signedIn) {
    elements.accountNotice.dataset.state = "warning";
    elements.accountNotice.textContent = "Sign in to save and manage private files.";
    const link = document.createElement("a");
    link.href = "/account/sign-in";
    link.textContent = "Sign in";
    link.className = "notice-link";
    elements.accountNotice.append(" ", link);
    setLibraryStatus("Sign in to view your private files.");
    return;
  }
  elements.accountNotice.dataset.state = "success";
  elements.accountNotice.textContent = isAdmin
    ? "Your personal uploads stay private. You also have access to the separate administrator-managed shared library."
    : "Your files are private to your signed-in Mina Teach account.";
  await loadDocuments();
  if (isAdmin) await loadSharedDocuments();
}

elements.fileInput.addEventListener("change", () => {
  const file = elements.fileInput.files?.[0];
  elements.uploadButton.disabled = !signedIn || !file;
  elements.uploadButton.textContent = file ? `Upload ${file.name.slice(0, 34)}` : "Upload and process";
  elements.uploadStatus.textContent = file && file.size > 8 * 1024 * 1024
    ? "This file is larger than the 8 MB limit."
    : "";
  if (file && file.size > 8 * 1024 * 1024) elements.uploadButton.disabled = true;
});

elements.uploadForm.addEventListener("submit", async event => {
  event.preventDefault();
  const file = elements.fileInput.files?.[0];
  if (!signedIn || !file) return;
  const data = new FormData();
  data.append("file", file);
  elements.uploadButton.disabled = true;
  elements.uploadButton.textContent = "Extracting and indexing…";
  elements.uploadStatus.textContent = "The file is being checked and indexed. Large files may take a moment.";
  elements.uploadStatus.dataset.state = "info";
  try {
    const result = await api("/api/knowledge/documents", { method: "POST", body: data });
    const status = result.document?.processingStatus;
    elements.uploadStatus.dataset.state = result.duplicate ? "info" : status === "ready" || status === "available_for_ai" ? "success" : "warning";
    elements.uploadStatus.textContent = result.duplicate
      ? "That file is already in your library; no duplicate was created."
      : result.document?.processingNotice || "File uploaded and searchable in your private library.";
    elements.fileInput.value = "";
    await loadDocuments();
  } catch (error) {
    elements.uploadStatus.dataset.state = "error";
    elements.uploadStatus.textContent = error.message;
  } finally {
    elements.uploadButton.textContent = "Upload and process";
    elements.uploadButton.disabled = !signedIn || !elements.fileInput.files?.length;
  }
});

elements.sharedFileInput.addEventListener("change", () => {
  const file = elements.sharedFileInput.files?.[0];
  elements.sharedUploadButton.disabled = !isAdmin || !file || file.size > 8 * 1024 * 1024;
  elements.sharedUploadButton.textContent = file ? `Process ${file.name.slice(0, 30)}` : "Process into shared library";
  elements.sharedUploadStatus.textContent = file && file.size > 8 * 1024 * 1024
    ? "This file is larger than the 8 MB per-file limit."
    : "";
});

elements.sharedUploadForm.addEventListener("submit", async event => {
  event.preventDefault();
  const file = elements.sharedFileInput.files?.[0];
  if (!isAdmin || !file) return;
  const data = new FormData();
  data.append("file", file);
  elements.sharedUploadButton.disabled = true;
  elements.sharedUploadButton.textContent = "Extracting and indexing…";
  elements.sharedUploadStatus.dataset.state = "info";
  elements.sharedUploadStatus.textContent = "Reading the source and indexing searchable text. No AI provider is called during upload.";
  try {
    const result = await api("/api/knowledge/shared/documents", { method: "POST", body: data });
    const status = result.document?.processingStatus;
    elements.sharedUploadStatus.dataset.state = result.duplicate ? "info" : status === "ready" ? "success" : "warning";
    elements.sharedUploadStatus.textContent = result.duplicate
      ? "An identical source already exists in the shared library; no second copy was stored."
      : result.document?.processingNotice || "Source stored. Review the extraction status and source details.";
    elements.sharedFileInput.value = "";
    await loadSharedDocuments();
  } catch (error) {
    elements.sharedUploadStatus.dataset.state = "error";
    elements.sharedUploadStatus.textContent = error.message;
  } finally {
    elements.sharedUploadButton.textContent = "Process into shared library";
    elements.sharedUploadButton.disabled = !isAdmin || !elements.sharedFileInput.files?.length;
  }
});

elements.searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void loadDocuments(), 250);
});
elements.categoryFilter.addEventListener("change", renderDocuments);
elements.sharedSearchInput.addEventListener("input", () => {
  clearTimeout(sharedSearchTimer);
  sharedSearchTimer = setTimeout(() => void loadSharedDocuments(), 250);
});

void checkAccount();
