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
    "General Knowledge": ["Study skills","Research and evidence","Critical thinking","Review"],
    "Basic Technical Drawing": ["Drawing instruments","Geometric construction","Orthographic drawing","Dimensioning"],
    "General Business": ["Business concepts","Entrepreneurship","Marketing","Business finance"],
    "Health and Physical Education": ["Personal health","Physical fitness","Sports skills","Safety"]
  };
  const state = load();
  let accountSyncEnabled = false;
  const $ = (id) => document.getElementById(id);
  const grade = $("grade"), stream = $("stream"), dialog = $("lesson-dialog");
  const lessonSearch = $("lesson-search"), lessonSubject = $("lesson-subject-filter"), lessonLanguage = $("lesson-language");
  let current = null;
  let requestedSubject = new URLSearchParams(location.search).get("subject");

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || "{}");
      return { settings: parsed.settings || { grade: "9", stream: "natural" }, completed: parsed.completed || [], saved: parsed.saved || [], tasks: parsed.tasks || [] };
    } catch { return { settings: { grade: "9", stream: "natural" }, completed: [], saved: [], tasks: [] }; }
  }
  function persist() {
    localStorage.setItem(KEY, JSON.stringify(state));
    if (accountSyncEnabled) fetch("/api/account/data/learning", {
      method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: state }),
    }).catch(() => {});
  }
  function scopeKey() { return `${grade.value}:${stream.value}`; }
  function visibleSubjects() {
    const common = ["English","Afaan Oromoo","Amharic","ICT","Aptitude","General Knowledge","Health and Physical Education"];
    const natural = new Set(["Mathematics","Physics","Chemistry","Biology","Environmental Science","Basic Technical Drawing",...common]);
    const social = new Set(["Geography","History","Economics","Civics and Ethics","General Business",...common]);
    return Object.entries(subjects).filter(([name]) => (stream.value === "natural" ? natural : social).has(name));
  }
  function renderSubjects() {
    $("grade-label").textContent = grade.value;
    $("stream-label").textContent = stream.value === "natural" ? "NATURAL SCIENCE" : "SOCIAL SCIENCE";
    if (requestedSubject && subjects[requestedSubject]) {
      document.querySelectorAll(".welcome,.stats,.lesson-library,.planner,.saved-panel,footer").forEach(node=>{node.hidden=true;});
      renderSubjectPage(requestedSubject);
      window.scrollTo(0,0);
      return;
    }
    document.querySelectorAll(".welcome,.stats,.lesson-library,.planner,.saved-panel,footer").forEach(node=>{node.hidden=false;});
    const root = $("subjects");
    root.replaceChildren();
    visibleSubjects().forEach(([name, topics]) => {
      const done = topics.filter((_, i) => state.completed.includes(`${scopeKey()}:${name}:${i}`)).length;
      const card = document.createElement("article"); card.className = "subject-card";
      const text = document.createElement("div");
      const title = document.createElement("h3"); title.textContent = name;
      const meta = document.createElement("small"); meta.textContent = `${done} of ${topics.length} study prompts completed`;
      text.append(title, meta);
      const button = document.createElement("a"); button.className="subject-open"; button.textContent = "Open subject";
      button.href=`/learning/?${new URLSearchParams({grade:grade.value,stream:stream.value,subject:name})}`;
      const practice=document.createElement("a");practice.className="subject-practice";practice.textContent="Practice";practice.href=`/exams/?${new URLSearchParams({grade:grade.value,stream:stream.value,subject:name})}`;
      card.append(text, button, practice); root.append(card);
    });
    updateStats();
  }
  function renderSubjectPage(subject) {
    const root=$("subjects");root.replaceChildren();
    const back=document.createElement("a");back.className="button-secondary";back.textContent="← All subjects";back.href=`/learning/?${new URLSearchParams({grade:grade.value,stream:stream.value})}`;
    back.addEventListener("click",event=>{event.preventDefault();requestedSubject=null;history.pushState({}, "", back.href);renderSubjects();});
    const heading=document.createElement("h2");heading.textContent=`Grade ${grade.value} · ${subject}`;
    const intro=document.createElement("p");intro.className="muted";intro.textContent="Choose a topic to open its study panel, or start a subject-filtered exam.";
    const practice=document.createElement("a");practice.className="subject-open";practice.textContent="Practice this subject";practice.href=`/exams/?${new URLSearchParams({grade:grade.value,stream:stream.value,subject})}`;
    root.append(back,heading,intro,practice);
    subjects[subject].forEach((title,index)=>{
      const key=`${scopeKey()}:${subject}:${index}`;
      const row=document.createElement("article");row.className="subject-card";
      const text=document.createElement("div");const label=document.createElement("h3");label.textContent=title;
      const meta=document.createElement("small");meta.textContent=state.completed.includes(key)?"Completed":"Study prompt";
      text.append(label,meta);
      const open=document.createElement("button");open.type="button";open.textContent="Open topic";open.addEventListener("click",()=>openLesson({key,subject,title}));
      row.append(text,open);root.append(row);
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
    $("lesson-content").textContent = lesson.content || "This is a study organizer, not a verified lesson. Use your textbook or ask the AI tutor for an explanation.";
    const source=$("lesson-source");source.replaceChildren();
    source.append(document.createTextNode(lesson.sourceLabel ? `Source: ${lesson.sourceLabel}` : "No reviewed lesson source is attached to this study prompt."));
    if(lesson.sourceUrl){const link=document.createElement("a");link.href=lesson.sourceUrl;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Open source";source.append(document.createTextNode(" · "),link);}
    const examples = lesson.examples || [], points = lesson.keyPoints || [];
    $("lesson-examples-wrap").hidden = !examples.length; $("lesson-points-wrap").hidden = !points.length;
    $("lesson-examples").replaceChildren(...examples.map(text => { const li=document.createElement("li");li.textContent=text;return li; }));
    $("lesson-points").replaceChildren(...points.map(text => { const li=document.createElement("li");li.textContent=text;return li; }));
    const query = new URLSearchParams({grade:grade.value,stream:stream.value,subject:lesson.subject,topic:lesson.chapter||""});
    $("practice-lesson").href = `/exams/?${query.toString()}`;
    const saved = state.saved.some(item => item.key === lesson.key);
    $("save-lesson").textContent = saved ? "★ Saved" : "☆ Save lesson";
    $("complete-lesson").textContent = state.completed.includes(lesson.key) ? "Completed ✓" : "Mark complete";
    dialog.showModal();
  }
  function renderLessons(lessons) {
    const root=$("lesson-list");root.replaceChildren();
    if(!lessons.length){$("lesson-status").textContent=`No reviewed ${lessonLanguage.options[lessonLanguage.selectedIndex].text} lessons are published for this selection yet. Drafts are not shown to students.`;return;}
    $("lesson-status").textContent=`${lessons.length} reviewed lesson${lessons.length===1?"":"s"} available.`;
    lessons.forEach(lesson=>{
      const card=document.createElement("article");card.className="lesson-card";
      const meta=document.createElement("p");meta.textContent=`Grade ${lesson.grade} · ${lesson.subject} · ${lesson.chapter}`;
      const title=document.createElement("h3");title.textContent=lesson.title;
      const language=document.createElement("p");language.textContent={en:"English",om:"Afaan Oromoo",am:"Amharic"}[lesson.language]||lesson.language;
      const open=document.createElement("button");open.type="button";open.textContent="Open lesson";open.addEventListener("click",()=>openLesson({...lesson,key:`lesson:${lesson.id}`}));
      card.append(meta,title,language,open);root.append(card);
    });
  }
  async function loadLessons() {
    $("lesson-status").textContent="Loading reviewed lessons…";
    const params=new URLSearchParams({grade:grade.value,stream:stream.value,language:lessonLanguage.value});
    if(lessonSubject.value)params.set("subject",lessonSubject.value);
    if(lessonSearch.value.trim())params.set("search",lessonSearch.value.trim());
    try{const result=await fetch(`/api/learning/lessons?${params}`).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d?.error?.message||"Lessons could not be loaded.");return d;});renderLessons(result.lessons);}
    catch(error){$("lesson-status").textContent=error.message;}
  }
  async function loadQuizProgress() {
    const root=$("quiz-progress");
    try{const r=await fetch("/api/exams/history",{credentials:"same-origin"});const data=await r.json();if(!r.ok)throw new Error(data?.error?.message||"Sign in to view saved quiz results.");
      root.replaceChildren();if(!data.attempts.length){root.textContent="No saved quiz results yet. Start a practice set to record your score.";return;}
      data.attempts.slice(0,8).forEach(attempt=>{const item=document.createElement("p");item.textContent=`Grade ${attempt.grade} · ${attempt.subject||"All subjects"} · ${attempt.score}/${attempt.total}`;root.append(item);});
    }catch{root.textContent="Sign in to save and view quiz scores.";}
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
  function updateScope() { state.settings = { grade: grade.value, stream: stream.value }; persist(); renderSubjects(); loadLessons(); }
  const routeGrade=new URLSearchParams(location.search).get("grade");
  const routeStream=new URLSearchParams(location.search).get("stream");
  grade.value = ["9","10","11","12"].includes(routeGrade) ? routeGrade : String(state.settings.grade || "9");
  stream.value = ["natural","social"].includes(routeStream) ? routeStream : state.settings.stream || "natural";
  if(!subjects[requestedSubject])requestedSubject=null;
  Object.keys(subjects).sort().forEach(name=>{const option=document.createElement("option");option.value=name;option.textContent=name;lessonSubject.append(option);});
  grade.addEventListener("change", updateScope); stream.addEventListener("change", updateScope);
  window.addEventListener("popstate",()=>{const params=new URLSearchParams(location.search);requestedSubject=params.get("subject");if(!subjects[requestedSubject])requestedSubject=null;const g=params.get("grade"),s=params.get("stream");if(["9","10","11","12"].includes(g))grade.value=g;if(["natural","social"].includes(s))stream.value=s;renderSubjects();loadLessons();});
  lessonSubject.addEventListener("change",loadLessons);lessonLanguage.addEventListener("change",loadLessons);
  let searchTimer;lessonSearch.addEventListener("input",()=>{clearTimeout(searchTimer);searchTimer=setTimeout(loadLessons,250);});
  renderSubjects(); renderTasks(); renderSaved();
  loadLessons();
  (async()=>{
    try{
      const status=await fetch("/api/account/status",{credentials:"same-origin"}).then(r=>r.json());
      if(!status.signedIn){$("quiz-progress").textContent="Sign in to save and view quiz scores.";return;}
      const result=await fetch("/api/account/data",{credentials:"same-origin"}).then(r=>r.json());
      if (result.records?.learning && typeof result.records.learning === "object") {
        const remote = result.records.learning;
        state.completed = [...new Set([...(remote.completed || []), ...state.completed])];
        const savedByKey = new Map([...(remote.saved || []), ...state.saved].map(item => [item.key, item]));
        const tasksByText = new Map([...(remote.tasks || []), ...state.tasks].map(item => [item.text, item]));
        state.saved = [...savedByKey.values()];
        state.tasks = [...tasksByText.values()];
        state.settings = { ...(remote.settings || {}), ...state.settings };
        grade.value = String(state.settings.grade || "9");
        stream.value = state.settings.stream || "natural";
      }
      accountSyncEnabled = true;
      persist(); renderSubjects(); renderTasks(); renderSaved(); loadLessons(); await loadQuizProgress();
    }catch{}
  })();
})();
