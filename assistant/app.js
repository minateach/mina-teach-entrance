import { getLocalImage, saveLocalImage } from "./image-store.js";

const STORAGE_KEY = "mina-teach.assistant.conversations.v1";
let storageAvailable = true;

const elements = {
  conversationScroll: document.getElementById("conversationScroll"),
  historyList: document.getElementById("historyList"),
  newConversation: document.getElementById("newConversation"),
  chatForm: document.getElementById("chatForm"),
  messageInput: document.getElementById("messageInput"),
  sendButton: document.getElementById("sendButton"),
  galleryButton: document.getElementById("galleryButton"),
  cameraButton: document.getElementById("cameraButton"),
  galleryInput: document.getElementById("galleryInput"),
  cameraInput: document.getElementById("cameraInput"),
  attachmentPreview: document.getElementById("imageAttachmentPreview"),
  attachmentThumbnail: document.getElementById("imageAttachmentThumbnail"),
  attachmentName: document.getElementById("imageAttachmentName"),
  removeSelectedImage: document.getElementById("removeSelectedImage"),
  gradeSelect: document.getElementById("gradeSelect"),
  languageSelect: document.getElementById("languageSelect"),
  statusPill: document.getElementById("statusPill"),
  statusText: document.getElementById("statusText"),
  statusBanner: document.getElementById("statusBanner"),
  sidebar: document.getElementById("sidebar"),
  mobileMenuButton: document.getElementById("mobileMenuButton"),
  sidebarScrim: document.getElementById("sidebarScrim"),
  quickPrompts: [...document.querySelectorAll("[data-prompt]")],
};

let conversations = readConversations();
let activeConversationId = null;
let isLoading = false;
let retryMessage = "";
let retryError = "";
let providerConfigured = null;
let accountSyncEnabled = false;
let selectedImage = null;
const messageImageUrls = new Set();

function readConversations() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter((item) =>
      item &&
      typeof item.id === "string" &&
      typeof item.title === "string" &&
      [9, 10, 11, 12].includes(Number(item.grade)) &&
      ["auto", "en", "am", "om"].includes(item.language) &&
      Array.isArray(item.messages)
    );
  } catch {
    storageAvailable = false;
    return [];
  }
}

function persistConversations() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  renderHistory();
  renderStorageNote();
  if (accountSyncEnabled) {
    fetch("/api/account/data/conversations", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: conversations }),
    }).catch(() => {});
  }
}

async function syncAccountConversations() {
  try {
    const authResponse = await fetch("/api/account/status", { credentials: "same-origin" });
    if (!authResponse.ok) return;
    const auth = await authResponse.json();
    if (!auth.signedIn) return;
    const response = await fetch("/api/account/data", { credentials: "same-origin" });
    if (!response.ok) return;
    const { records } = await response.json();
    accountSyncEnabled = true;
    const merged = new Map((records?.conversations || []).map(item => [item.id, item]));
    conversations.forEach(item => merged.set(item.id, item));
    conversations = [...merged.values()].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    persistConversations();
    if (elements.storageNote) elements.storageNote.textContent = "Sessions sync to your account and stay on this device.";
  } catch {
    accountSyncEnabled = false;
  }
}

function makeId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `mina-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getActiveConversation() {
  return conversations.find((conversation) => conversation.id === activeConversationId) || null;
}

function createConversation() {
  retryMessage = "";
  retryError = "";
  const conversation = {
    id: makeId(),
    title: "A new study session",
    grade: Number(elements.gradeSelect.value),
    language: elements.languageSelect.value,
    updatedAt: new Date().toISOString(),
    messages: [],
  };
  conversations.unshift(conversation);
  activeConversationId = conversation.id;
  persistConversations();
  renderConversation();
  closeMobileSidebar();
  elements.messageInput.focus();
}

function selectConversation(id) {
  const conversation = conversations.find((item) => item.id === id);
  if (!conversation) return;
  retryMessage = "";
  retryError = "";
  activeConversationId = id;
  elements.gradeSelect.value = String(conversation.grade);
  elements.languageSelect.value = conversation.language;
  renderHistory();
  renderConversation();
  closeMobileSidebar();
}

function updateActiveSettings() {
  const conversation = getActiveConversation();
  if (!conversation) return;
  conversation.grade = Number(elements.gradeSelect.value);
  conversation.language = elements.languageSelect.value;
  conversation.updatedAt = new Date().toISOString();
  persistConversations();
}

function renderHistory() {
  elements.historyList.replaceChildren();
  if (!conversations.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "Your study sessions will be kept here on this device.";
    elements.historyList.append(empty);
    return;
  }

  conversations
    .slice()
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .forEach((conversation) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "history-item";
      button.setAttribute("aria-current", String(conversation.id === activeConversationId));
      button.setAttribute("aria-label", `${conversation.title}, Grade ${conversation.grade}`);
      button.addEventListener("click", () => selectConversation(conversation.id));

      const title = document.createElement("span");
      title.className = "history-title";
      title.textContent = conversation.title;

      const meta = document.createElement("span");
      meta.className = "history-meta";
      meta.textContent = `Grade ${conversation.grade} · ${formatDate(conversation.updatedAt)}`;

      button.append(title, meta);
      elements.historyList.append(button);
    });
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved session";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return `Today, ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date)}`;
  }
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function renderStorageNote() {
  const note = document.getElementById("storageNote");
  note.textContent = storageAvailable
    ? "Sessions are saved only in this browser."
    : "Browser storage is unavailable; sessions may not be saved.";
  note.setAttribute("role", storageAvailable ? "note" : "alert");
}

async function prepareImageFile(file) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPG, PNG, or WEBP image.");
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error("Choose an image smaller than 12 MB; it will be resized before upload.");
  }
  if (typeof createImageBitmap !== "function") {
    if (file.size > 5 * 1024 * 1024) throw new Error("This browser cannot resize the image. Choose one under 5 MB.");
    return file;
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    if (
      bitmap.width < 16 ||
      bitmap.height < 16 ||
      bitmap.width > 50_000 ||
      bitmap.height > 50_000 ||
      bitmap.width * bitmap.height > 50_000_000
    ) {
      throw new Error("This image has unsupported dimensions. Choose a smaller image.");
    }
    const scale = Math.min(1, 2_048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("This browser cannot prepare the image.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error("The image could not be prepared.")),
        "image/jpeg",
        0.86,
      );
    });
    const safeName = `${String(file.name || "image").replace(/\.[^.]*$/, "").slice(0, 100) || "image"}.jpg`;
    return new File([blob], safeName, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    bitmap?.close?.();
  }
}

function clearSelectedImage() {
  if (selectedImage?.previewUrl) URL.revokeObjectURL(selectedImage.previewUrl);
  selectedImage = null;
  elements.galleryInput.value = "";
  elements.cameraInput.value = "";
  elements.attachmentPreview.hidden = true;
  elements.attachmentThumbnail.removeAttribute("src");
  elements.attachmentName.textContent = "";
  updateSendButton();
}

async function selectImageFile(file) {
  try {
    const prepared = await prepareImageFile(file);
    if (selectedImage?.previewUrl) URL.revokeObjectURL(selectedImage.previewUrl);
    selectedImage = {
      file: prepared,
      name: prepared.name || "image.jpg",
      previewUrl: URL.createObjectURL(prepared),
    };
    elements.attachmentThumbnail.src = selectedImage.previewUrl;
    elements.attachmentName.textContent = `${selectedImage.name} · ${(prepared.size / (1024 * 1024)).toFixed(1)} MB`;
    elements.attachmentPreview.hidden = false;
    updateSendButton();
    elements.messageInput.focus();
  } catch (error) {
    setStatus("error", "Image not attached", "Could not prepare this image", error.message || "Choose a smaller JPG, PNG, or WEBP image.");
  }
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("The image could not be prepared for analysis."));
    reader.onerror = () => reject(new Error("The image could not be read from this device."));
    reader.readAsDataURL(blob);
  });
}

function createMessageNode(message) {
  const wrapper = document.createElement("article");
  wrapper.className = `message ${message.role}`;
  wrapper.setAttribute("aria-label", message.role === "user" ? "Your message" : "Mina Teach response");

  const mark = document.createElement("span");
  mark.className = "message-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = message.role === "user" ? "You" : "M";

  const contentWrap = document.createElement("div");
  contentWrap.className = "message-content-wrap";

  const author = document.createElement("span");
  author.className = "message-author";
  author.textContent = message.role === "user" ? "You" : "MINA TEACH AI";

  const content = document.createElement("div");
  content.className = "message-content";
  content.textContent = message.content;

  contentWrap.append(author);
  const attachmentId = message.role === "user" &&
    typeof message.imageAttachmentId === "string" &&
    message.imageAttachmentId.length <= 100
    ? message.imageAttachmentId
    : "";
  if (attachmentId) {
    const unavailable = document.createElement("p");
    unavailable.className = "message-image-unavailable";
    unavailable.textContent = "Loading the image saved on this device…";
    contentWrap.append(unavailable);
    void getLocalImage(attachmentId).then((stored) => {
      if (!wrapper.isConnected) return;
      if (!stored?.blob) {
        unavailable.textContent = "This image is not available on this device. Re-upload it to ask another question.";
        return;
      }
      const image = document.createElement("img");
      image.className = "message-image-preview";
      image.alt = "Image attached to your question";
      const url = URL.createObjectURL(stored.blob);
      messageImageUrls.add(url);
      image.src = url;
      unavailable.remove();
      contentWrap.insertBefore(image, content);
    }).catch(() => {
      if (wrapper.isConnected) unavailable.textContent = "This image could not be loaded from this device.";
    });
  }

  let researchInfo = null;
  if (message.role === "assistant" && message.webResearch && typeof message.webResearch === "object") {
    researchInfo = document.createElement("aside");
    researchInfo.className = `message-research${message.webResearch.searched ? " searched" : ""}`;
    researchInfo.setAttribute("aria-label", "Web research status and citations");

    const status = document.createElement("p");
    status.className = "research-status";
    status.textContent = String(message.webResearch.notice || (
      message.webResearch.searched
        ? "Searched the web. Review the cited sources."
        : "No web search was performed; this answer is from general model knowledge."
    ));
    researchInfo.append(status);

    const sources = Array.isArray(message.webResearch.sources)
      ? message.webResearch.sources.slice(0, 12)
      : [];
    if (message.webResearch.searched && sources.length) {
      const heading = document.createElement("strong");
      heading.className = "research-sources-heading";
      heading.textContent = "Sources";
      const list = document.createElement("ol");
      list.className = "research-sources";
      for (const source of sources) {
        if (typeof source?.url !== "string" || typeof source?.title !== "string") continue;
        try {
          const url = new URL(source.url);
          if (url.protocol !== "https:") continue;
          const item = document.createElement("li");
          const link = document.createElement("a");
          link.href = url.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = source.title.slice(0, 180) || url.hostname;
          item.append(link);
          list.append(item);
        } catch {
          // Invalid stored citation URLs are never rendered as links.
        }
      }
      if (list.childElementCount) researchInfo.append(heading, list);
    }
  }

  const time = document.createElement("time");
  time.className = "message-time";
  time.dateTime = message.createdAt;
  const date = new Date(message.createdAt);
  time.textContent = Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);

  contentWrap.append(content);
  if (
    message.role === "assistant" &&
    message.imageUsage &&
    Number.isFinite(message.imageUsage.inputTokens) &&
    Number.isFinite(message.imageUsage.outputTokens)
  ) {
    const usageNote = document.createElement("p");
    usageNote.className = "image-usage-note";
    usageNote.textContent = `Gemini image request · ${message.imageUsage.inputTokens} input tokens · ${message.imageUsage.outputTokens} output tokens`;
    contentWrap.append(usageNote);
  }
  if (researchInfo) contentWrap.append(researchInfo);
  contentWrap.append(time);
  wrapper.append(mark, contentWrap);
  return wrapper;
}

function renderConversation() {
  for (const url of messageImageUrls) URL.revokeObjectURL(url);
  messageImageUrls.clear();
  elements.conversationScroll.replaceChildren();
  const conversation = getActiveConversation();
  if (!conversation || conversation.messages.length === 0) {
    elements.conversationScroll.append(createWelcome());
    return;
  }
  conversation.messages.forEach((message) => {
    elements.conversationScroll.append(createMessageNode(message));
  });
  if (isLoading) elements.conversationScroll.append(createTypingIndicator());
  if (retryMessage) elements.conversationScroll.append(createErrorCard());
  scrollConversationToEnd();
}

function createWelcome() {
  const welcome = document.createElement("section");
  welcome.className = "welcome";
  welcome.setAttribute("aria-labelledby", "welcomeTitle");

  const logo = document.createElement("img");
  logo.className = "welcome-logo";
  logo.src = "/images/0_1000107983_1794514022860.png";
  logo.srcset = "/images/mina-teach-ai-logo-256.png 256w, /images/mina-teach-ai-logo-512.png 512w, /images/mina-teach-ai-logo-1024.png 1024w";
  logo.sizes = "(max-width: 640px) 180px, 220px";
  logo.alt = "Dambi Dollo University and Mina Teach AI logo";

  const kicker = document.createElement("div");
  kicker.className = "welcome-kicker";
  kicker.textContent = "Your study companion";

  const title = document.createElement("h2");
  title.id = "welcomeTitle";
  title.append(document.createTextNode("Let’s work it out, "));
  const emphasis = document.createElement("span");
  emphasis.textContent = "step by step.";
  title.append(emphasis);

  const description = document.createElement("p");
  description.className = "welcome-description";
  description.textContent = "Bring a question from class or your entrance exam revision. I’ll explain the thinking clearly, at your pace.";

  const details = document.createElement("div");
  details.className = "welcome-details";
  details.textContent = "Choose your grade and language, then ask anything you are studying.";

  const prompts = document.createElement("div");
  prompts.className = "quick-prompts";

  const practiceButton = createPromptButton(
    "practice",
    "Make a practice question",
    "Try an entrance-exam question for your grade",
    "practice"
  );
  const oromoButton = createPromptButton(
    "translate",
    "Explain in Afaan Oromoo",
    "Understand an English question, step by step",
    "oromo"
  );
  prompts.append(practiceButton, oromoButton);
  welcome.append(logo, kicker, title, description, details, prompts);
  return welcome;
}

function createPromptButton(symbol, titleText, descriptionText, promptType) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "quick-prompt";
  button.dataset.prompt = promptType;
  button.setAttribute("aria-label", `${titleText}: ${descriptionText}`);

  const mark = document.createElement("span");
  mark.className = "prompt-symbol";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = symbol === "practice" ? "Q" : "A";

  const copy = document.createElement("span");
  copy.className = "quick-prompt-copy";
  const title = document.createElement("span");
  title.className = "quick-prompt-title";
  title.textContent = titleText;
  const description = document.createElement("span");
  description.className = "quick-prompt-description";
  description.textContent = descriptionText;
  copy.append(title, description);
  button.append(mark, copy);
  button.addEventListener("click", () => runQuickPrompt(promptType));
  return button;
}

function createTypingIndicator() {
  const indicator = document.createElement("div");
  indicator.className = "typing-indicator";
  indicator.setAttribute("role", "status");
  indicator.setAttribute("aria-label", "Checking whether current web sources are needed");

  const mark = document.createElement("span");
  mark.className = "message-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = "M";
  const dots = document.createElement("span");
  dots.className = "typing-dots";
  dots.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 3; i += 1) dots.append(document.createElement("span"));
  const text = document.createElement("span");
  text.textContent = "Checking whether current web sources are needed";
  indicator.append(mark, dots, text);
  return indicator;
}

function createErrorCard() {
  const card = document.createElement("div");
  card.className = "error-card";
  card.setAttribute("role", "alert");
  const text = document.createElement("p");
  text.textContent = retryError;
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "retry-button";
  retry.textContent = "Try again";
  retry.addEventListener("click", () => sendMessage(retryMessage, true));
  card.append(text);
  if (providerConfigured !== false) card.append(retry);
  return card;
}

function scrollConversationToEnd() {
  requestAnimationFrame(() => {
    elements.conversationScroll.scrollTop = elements.conversationScroll.scrollHeight;
  });
}

function setStatus(state, label, bannerTitle = "", bannerMessage = "") {
  elements.statusPill.dataset.state = state;
  elements.statusText.textContent = label;
  elements.statusBanner.replaceChildren();
  if (!bannerMessage) {
    elements.statusBanner.dataset.visible = "false";
    return;
  }
  const title = document.createElement("strong");
  title.textContent = bannerTitle;
  const message = document.createElement("span");
  message.textContent = bannerMessage;
  elements.statusBanner.append(title, message);
  if (state === "error" || state === "missing") {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "status-retry";
    retry.textContent = "Check again";
    retry.addEventListener("click", checkAssistantStatus);
    elements.statusBanner.append(retry);
  }
  elements.statusBanner.dataset.visible = "true";
}

async function checkAssistantStatus() {
  setStatus("checking", "Checking tutor");
  try {
    const response = await fetch("/api/assistant/status", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result?.error?.message || "We could not check the tutor right now.");
    }
    providerConfigured = result.configured === true
      ? true
      : result.code === "SETUP_REQUIRED"
        ? false
        : null;
    if (providerConfigured) {
      setStatus("ready", "Gemini key configured");
    } else if (providerConfigured === false) {
      setStatus(
        "missing",
        "Tutor unavailable",
        "Gemini configuration required",
        result.message || "AI tutoring is temporarily unavailable. Your saved study sessions are still here; please try again later."
      );
    } else {
      setStatus(
        "error",
        "Status unavailable",
        "Could not check tutor status",
        result.message || "Please check your connection. You can try sending a question again."
      );
    }
  } catch (error) {
    providerConfigured = null;
    setStatus(
      "error",
      "Status unavailable",
      "Could not check tutor status",
      error.message || "Please check your connection. You can try sending a question again."
    );
  }
  updateSendButton();
}

function updateSendButton() {
  const hasText = elements.messageInput.value.trim().length > 0;
  const hasImage = Boolean(selectedImage);
  elements.sendButton.disabled = isLoading || (!hasText && !hasImage) || providerConfigured === false;
  elements.sendButton.setAttribute(
    "aria-label",
    isLoading
      ? "Waiting for tutor response"
      : hasImage
        ? hasText ? "Send question with image" : "Send image for analysis"
        : "Send message",
  );
}

function updateConversationTitle(conversation, firstMessage) {
  if (conversation.messages.filter((message) => message.role === "user").length === 1) {
    const cleaned = firstMessage.trim().replace(/\s+/g, " ");
    conversation.title = cleaned.length > 42 ? `${cleaned.slice(0, 39)}…` : cleaned;
  }
}

async function sendMessage(rawMessage, isRetry = false) {
  const typedMessage = String(rawMessage || "").trim();
  if ((!typedMessage && !selectedImage && !isRetry) || isLoading) return;
  const messageText = typedMessage || "Describe this image and help me understand any text, diagram, or schoolwork in it.";
  if (providerConfigured === false) {
    elements.statusBanner.dataset.visible = "true";
    elements.statusBanner.setAttribute("role", "alert");
    return;
  }

  let conversation = getActiveConversation();
  if (!conversation) {
    const newItem = {
      id: makeId(),
      title: "A new study session",
      grade: Number(elements.gradeSelect.value),
      language: elements.languageSelect.value,
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    conversations.unshift(newItem);
    activeConversationId = newItem.id;
    conversation = newItem;
  }

  const priorMessages = conversation.messages.slice();
  const priorImageMessage = priorMessages.slice().reverse().find(
    (message) => message.role === "user" && typeof message.imageAttachmentId === "string",
  );
  let imageAttachmentId = selectedImage ? makeId() : priorImageMessage?.imageAttachmentId || null;
  let imageDataUrl = null;
  if (selectedImage) {
    try {
      await saveLocalImage(imageAttachmentId, selectedImage.file, selectedImage.name);
    } catch (error) {
      setStatus(
        "error",
        "Image not saved",
        "Could not save the attachment on this device",
        error.message || "Check browser storage and try again.",
      );
      return;
    }
  }
  if (imageAttachmentId) {
    try {
      const stored = await getLocalImage(imageAttachmentId);
      if (!stored?.blob) {
        setStatus(
          "error",
          "Image unavailable",
          "This image is not on this device",
          "Re-upload the image before asking another question about it.",
        );
        return;
      }
      imageDataUrl = await readBlobAsDataUrl(stored.blob);
    } catch (error) {
      setStatus("error", "Image unavailable", "Could not read the saved image", error.message || "Re-upload the image and try again.");
      return;
    }
  }

  if (!isRetry) {
    const userMessage = {
      id: makeId(),
      role: "user",
      content: messageText,
      ...(selectedImage ? { imageAttachmentId } : {}),
      createdAt: new Date().toISOString(),
    };
    conversation.messages.push(userMessage);
    updateConversationTitle(conversation, messageText);
    retryMessage = "";
    retryError = "";
  } else {
    retryMessage = "";
    retryError = "";
  }
  if (selectedImage) clearSelectedImage();

  conversation.grade = Number(elements.gradeSelect.value);
  conversation.language = elements.languageSelect.value;
  conversation.updatedAt = new Date().toISOString();
  persistConversations();
  elements.messageInput.value = "";
  resizeInput();
  isLoading = true;
  updateSendButton();
  setStatus("checking", "Checking if web search is needed");
  renderConversation();

  const history = (isRetry ? priorMessages.slice(0, -1) : priorMessages).map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  }));

  try {
    const response = await fetch("/api/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        grade: Number(conversation.grade),
        language: conversation.language,
        message: isRetry ? messageText : messageText,
        history,
        ...(imageDataUrl ? { imageDataUrl } : {}),
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result?.error?.message || "Your question could not be sent. Please try again.");
      error.code = result?.error?.code || "";
      throw error;
    }
    if (typeof result.answer !== "string") {
      throw new Error("The tutor returned an unexpected response. Please try again.");
    }
    conversation.messages.push({
      id: makeId(),
      role: "assistant",
      content: result.answer,
      imageUsage: result.imageUsage && typeof result.imageUsage === "object"
        ? {
            inputTokens: Number(result.imageUsage.inputTokens) || 0,
            outputTokens: Number(result.imageUsage.outputTokens) || 0,
          }
        : null,
      webResearch: result.webResearch && typeof result.webResearch === "object"
        ? {
            searched: result.webResearch.searched === true,
            notice: typeof result.webResearch.notice === "string" ? result.webResearch.notice.slice(0, 400) : "",
            sources: Array.isArray(result.webResearch.sources)
              ? result.webResearch.sources.slice(0, 12).map((source) => ({
                  title: String(source?.title || "").slice(0, 180),
                  url: String(source?.url || "").slice(0, 2_000),
                }))
              : [],
          }
        : null,
      createdAt: new Date().toISOString(),
    });
    conversation.updatedAt = new Date().toISOString();
    retryMessage = "";
    if (result.answer) {
      setStatus("ready", "Tutor ready");
    }
  } catch (error) {
    retryMessage = messageText;
    retryError = error.message || "Please check your connection and try again.";
    if (error.code === "SETUP_REQUIRED") providerConfigured = false;
    if (error.code === "GEMINI_GROUNDING_LIMIT" || error.code === "GEMINI_RATE_LIMIT") {
      setStatus("error", "Search limit reached", "Google Search or Gemini limit reached", retryError);
    } else if (error.code === "GEMINI_VISION_LIMIT") {
      setStatus("error", "Image limit reached", "Monthly Gemini image-analysis limit reached", retryError);
    } else if (error.code === "GEMINI_GROUNDING_UNAVAILABLE") {
      setStatus("error", "Search unavailable", "Google Search grounding is not enabled for this API tier", retryError);
    } else if (error.code === "IMAGE_USAGE_UNAVAILABLE") {
      setStatus("error", "Image analysis paused", "Usage safeguards could not be confirmed", retryError);
    } else {
      setStatus(
        providerConfigured === false ? "missing" : "error",
        providerConfigured === false ? "Tutor unavailable" : "Connection issue",
        providerConfigured === false ? "The tutor is not connected yet" : "The tutor could not answer",
        retryError
      );
    }
  } finally {
    isLoading = false;
    persistConversations();
    renderConversation();
    updateSendButton();
  }
}

function runQuickPrompt(type) {
  const grade = Number(elements.gradeSelect.value);
  const prompt = type === "practice"
    ? `Create one Grade ${grade} National University Entrance Examination practice question. Give me the question first, then wait for my answer before explaining it.`
    : `Please explain this English question in Afaan Oromoo, step by step. I will paste the question next.`;
  if (type === "oromo") {
    elements.languageSelect.value = "om";
    updateActiveSettings();
    elements.messageInput.value = prompt;
    resizeInput();
    elements.messageInput.focus();
    return;
  }
  sendMessage(prompt);
}

function resizeInput() {
  elements.messageInput.style.height = "auto";
  elements.messageInput.style.height = `${Math.min(elements.messageInput.scrollHeight, 140)}px`;
  updateSendButton();
}

function openMobileSidebar() {
  elements.sidebar.dataset.open = "true";
  elements.sidebarScrim.dataset.open = "true";
  elements.mobileMenuButton.setAttribute("aria-expanded", "true");
}

function closeMobileSidebar() {
  elements.sidebar.dataset.open = "false";
  elements.sidebarScrim.dataset.open = "false";
  elements.mobileMenuButton.setAttribute("aria-expanded", "false");
}

elements.newConversation.addEventListener("click", createConversation);
document.getElementById("newConversationAlt").addEventListener("click", createConversation);
elements.galleryButton.addEventListener("click", () => elements.galleryInput.click());
elements.cameraButton.addEventListener("click", () => elements.cameraInput.click());
elements.galleryInput.addEventListener("change", () => {
  const file = elements.galleryInput.files?.[0];
  if (file) void selectImageFile(file);
});
elements.cameraInput.addEventListener("change", () => {
  const file = elements.cameraInput.files?.[0];
  if (file) void selectImageFile(file);
});
elements.removeSelectedImage.addEventListener("click", clearSelectedImage);
elements.chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(elements.messageInput.value);
});
elements.messageInput.addEventListener("input", resizeInput);
elements.messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    if (!elements.sendButton.disabled) sendMessage(elements.messageInput.value);
  }
});
elements.gradeSelect.addEventListener("change", updateActiveSettings);
elements.languageSelect.addEventListener("change", updateActiveSettings);
elements.quickPrompts.forEach((button) => {
  button.addEventListener("click", () => runQuickPrompt(button.dataset.prompt));
});
elements.mobileMenuButton.addEventListener("click", () => {
  if (elements.sidebar.dataset.open === "true") closeMobileSidebar();
  else openMobileSidebar();
});
elements.sidebarScrim.addEventListener("click", closeMobileSidebar);

if (conversations.length) {
  activeConversationId = conversations
    .slice()
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0].id;
  const active = getActiveConversation();
  elements.gradeSelect.value = String(active.grade);
  elements.languageSelect.value = active.language;
}

renderHistory();
renderStorageNote();
renderConversation();
updateSendButton();
checkAssistantStatus();
syncAccountConversations();
