const STORAGE_KEY = "mina-teach.assistant.conversations.v1";
let storageAvailable = true;

const elements = {
  conversationScroll: document.getElementById("conversationScroll"),
  historyList: document.getElementById("historyList"),
  newConversation: document.getElementById("newConversation"),
  chatForm: document.getElementById("chatForm"),
  messageInput: document.getElementById("messageInput"),
  sendButton: document.getElementById("sendButton"),
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

function readConversations() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter((item) =>
      item &&
      typeof item.id === "string" &&
      typeof item.title === "string" &&
      [9, 10, 11, 12].includes(Number(item.grade)) &&
      ["en", "am", "om"].includes(item.language) &&
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
  author.textContent = message.role === "user" ? "You" : "Mina Teach";

  const content = document.createElement("div");
  content.className = "message-content";
  content.textContent = message.content;

  const time = document.createElement("time");
  time.className = "message-time";
  time.dateTime = message.createdAt;
  const date = new Date(message.createdAt);
  time.textContent = Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);

  contentWrap.append(author, content, time);
  wrapper.append(mark, contentWrap);
  return wrapper;
}

function renderConversation() {
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
  welcome.append(kicker, title, description, details, prompts);
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
  indicator.setAttribute("aria-label", "Mina Teach is preparing a step-by-step explanation");

  const mark = document.createElement("span");
  mark.className = "message-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = "M";
  const dots = document.createElement("span");
  dots.className = "typing-dots";
  dots.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 3; i += 1) dots.append(document.createElement("span"));
  const text = document.createElement("span");
  text.textContent = "Mina is thinking through the steps";
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
      setStatus("ready", "Tutor ready");
    } else if (providerConfigured === false) {
      setStatus(
        "missing",
        "Tutor unavailable",
        "The tutor is not connected yet",
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
  elements.sendButton.disabled = isLoading || !hasText || providerConfigured === false;
  elements.sendButton.setAttribute("aria-label", isLoading ? "Waiting for tutor response" : "Send message");
}

function updateConversationTitle(conversation, firstMessage) {
  if (conversation.messages.filter((message) => message.role === "user").length === 1) {
    const cleaned = firstMessage.trim().replace(/\s+/g, " ");
    conversation.title = cleaned.length > 42 ? `${cleaned.slice(0, 39)}…` : cleaned;
  }
}

async function sendMessage(rawMessage, isRetry = false) {
  const messageText = rawMessage.trim();
  if (!messageText || isLoading) return;
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
  if (!isRetry) {
    const userMessage = {
      id: makeId(),
      role: "user",
      content: messageText,
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

  conversation.grade = Number(elements.gradeSelect.value);
  conversation.language = elements.languageSelect.value;
  conversation.updatedAt = new Date().toISOString();
  persistConversations();
  elements.messageInput.value = "";
  resizeInput();
  isLoading = true;
  updateSendButton();
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
    setStatus(
      providerConfigured === false ? "missing" : "error",
      providerConfigured === false ? "Tutor unavailable" : "Connection issue",
      providerConfigured === false ? "The tutor is not connected yet" : "The tutor could not answer",
      retryError
    );
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
