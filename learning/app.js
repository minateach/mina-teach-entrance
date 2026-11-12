(() => {
  const KEY = "minaTeach.learning.v1";
  const subjects = {
    "Mathematics": ["Number systems","Algebra","Geometry","Statistics"],
    "Physics": ["Measurement and units","Motion","Force and energy","Electricity"],
    "Chemistry": ["Matter and measurement","Atomic structure","Chemical bonding","Chemical reactions"],
    "Biology": ["Cell structure","Nutrition","Ecology","Human biology"],
    "English": ["Grammar","Vocabulary","Reading comprehension","Writing"],
    "Afaan Oromoo": ["Dubbisa","Jechoota","Seerluga","Barreessuu"],
    "Amharic": ["ንባብ","ቃላት","ሰዋሰው","ጽሑፍ"],
    "Geography": ["Maps and scale","Physical geography","Population","Environment"],
    "History": ["Historical sources","Ethiopian history","African history","World history"],
    "Economics": ["Basic economic concepts","Demand and supply","Production","Markets"],
    "Civics and Ethics": ["Citizenship","Constitution","Human rights","Responsibilities"],
    "ICT": ["Digital literacy","Computer systems","Networks","Information safety"],
    "Aptitude": ["Patterns","Logical reasoning","Problem solving","Data interpretation"],
    "Environmental Science": ["Ecosystems","Natural resources","Pollution","Conservation"],
    "General Knowledge": ["Study skills","Research and evidence","Critical thinking","Review"]
  };
  const state = load();
  const $ = (id) => document.getElementById(id);
  const grade = $("grade"), stream = $("stream"), dialog = $("lesson-dialog");
  let current = null;

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || "{}");
      return { settings: parsed.settings || { grade: "9", stream: "natural" }, completed: parsed.completed || [], saved: parsed.saved || [], tasks: parsed.tasks || [] };
    } catch { return { settings: { grade: "9", stream: "natural" }, completed: [], saved: [], tasks: [] }; }
  }
  function persist() { localStorage.setItem(KEY, JSON.stringify(state)); }
  function scopeKey() { return `${grade.value}:${stream.value}`; }
  function visibleSubjects() {
    const social = new Set(["English","Afaan Oromoo","Amharic","Geography","History","Economics","Civics and Ethics","ICT","Aptitude","Environmental Science","General Knowledge"]);
    return Object.entries(subjects).filter(([name]) => stream.value === "natural" || social.has(name));
  }
  function renderSubjects() {
    $("grade-label").textContent = grade.value;
    $("stream-label").textContent = stream.value === "natural" ? "NATURAL SCIENCE" : "SOCIAL SCIENCE";
    const root = $("subjects");
    root.replaceChildren();
    visibleSubjects().forEach(([name, topics]) => {
      const done = topics.filter((_, i) => state.completed.includes(`${scopeKey()}:${name}:${i}`)).length;
      const card = document.createElement("article"); card.className = "subject-card";
      const text = document.createElement("div");
      const title = document.createElement("h3"); title.textContent = name;
      const meta = document.createElement("small"); meta.textContent = `${done} of ${topics.length} study prompts completed`;
      text.append(title, meta);
      const button = document.createElement("button"); button.type = "button"; button.textContent = "View topics";
      button.addEventListener("click", () => showTopics(name, topics));
      card.append(text, button); root.append(card);
    });
    updateStats();
  }
  function showTopics(subject, topics) {
    const root = $("subjects"); root.replaceChildren();
    const back = document.createElement("button"); back.className = "button-secondary"; back.textContent = "← All subjects";
    back.addEventListener("click", renderSubjects); root.append(back);
    topics.forEach((title, i) => {
      const key = `${scopeKey()}:${subject}:${i}`;
      const row = document.createElement("article"); row.className = "subject-card";
      const text = document.createElement("div"); const heading = document.createElement("h3"); heading.textContent = title;
      const meta = document.createElement("small"); meta.textContent = state.completed.includes(key) ? "Completed" : `Grade ${grade.value} · study prompt`;
      text.append(heading, meta);
      const button = document.createElement("button"); button.textContent = "Open";
      button.addEventListener("click", () => openLesson({ key, subject, title }));
      row.append(text, button); root.append(row);
    });
  }
  function openLesson(lesson) {
    current = lesson;
    $("lesson-subject").textContent = `GRADE ${grade.value} · ${lesson.subject}`;
    $("lesson-title").textContent = lesson.title;
    const saved = state.saved.some(item => item.key === lesson.key);
    $("save-lesson").textContent = saved ? "★ Saved" : "☆ Save lesson";
    $("complete-lesson").textContent = state.completed.includes(lesson.key) ? "Completed ✓" : "Mark complete";
    dialog.showModal();
  }
  $("save-lesson").addEventListener("click", () => {
    if (!current) return;
    const index = state.saved.findIndex(item => item.key === current.key);
    if (index >= 0) state.saved.splice(index, 1);
    else state.saved.unshift({ key: current.key, subject: current.subject, title: current.title });
    persist(); $("save-lesson").textContent = index >= 0 ? "☆ Save lesson" : "★ Saved"; renderSaved(); updateStats();
  });
  $("complete-lesson").addEventListener("click", () => {
    if (!current) return;
    if (!state.completed.includes(current.key)) state.completed.push(current.key);
    persist(); $("complete-lesson").textContent = "Completed ✓"; renderSubjects();
  });
  function renderSaved() {
    const root = $("saved-lessons"); root.replaceChildren();
    if (!state.saved.length) { const empty = document.createElement("p"); empty.className = "muted"; empty.textContent = "Save a lesson from a subject to find it here."; root.append(empty); return; }
    state.saved.forEach((item, i) => {
      const chip = document.createElement("div"); chip.className = "saved-chip";
      chip.append(document.createTextNode(`${item.subject}: ${item.title}`));
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Remove"; remove.setAttribute("aria-label", `Remove ${item.title}`);
      remove.addEventListener("click", () => { state.saved.splice(i, 1); persist(); renderSaved(); updateStats(); });
      chip.append(remove); root.append(chip);
    });
  }
  function renderTasks() {
    const root = $("task-list"); root.replaceChildren();
    state.tasks.forEach((task, i) => {
      const row = document.createElement("li"); row.className = `task${task.done ? " done" : ""}`;
      const toggle = document.createElement("input"); toggle.type = "checkbox"; toggle.checked = task.done; toggle.setAttribute("aria-label", `Complete ${task.text}`);
      toggle.addEventListener("change", () => { task.done = toggle.checked; persist(); renderTasks(); updateStats(); });
      const label = document.createElement("span"); label.textContent = task.text;
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Remove"; remove.addEventListener("click", () => { state.tasks.splice(i, 1); persist(); renderTasks(); updateStats(); });
      row.append(toggle, label, remove); root.append(row);
    });
    updateStats();
  }
  function updateStats() {
    $("completed-count").textContent = state.completed.length;
    $("task-count").textContent = state.tasks.filter(task => !task.done).length;
    $("saved-count").textContent = state.saved.length;
  }
  $("task-form").addEventListener("submit", event => {
    event.preventDefault();
    const input = $("task-input"), text = input.value.trim();
    if (!text) return;
    state.tasks.push({ text, done: false }); persist(); input.value = ""; renderTasks();
  });
  function updateScope() { state.settings = { grade: grade.value, stream: stream.value }; persist(); renderSubjects(); }
  grade.value = String(state.settings.grade || "9");
  stream.value = state.settings.stream || "natural";
  grade.addEventListener("change", updateScope); stream.addEventListener("change", updateScope);
  renderSubjects(); renderTasks(); renderSaved();
})();
