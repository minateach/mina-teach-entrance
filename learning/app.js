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
      return { settings: parsed.settings || { grade: "9", stream: "natural" }, completed: parsed.completed || [], saved: parsed.saved || [], tasks: parsed.tasks || [], practice: Array.isArray(parsed.practice) ? parsed.practice : [] };
    } catch { return { settings: { grade: "9", stream: "natural" }, completed: [], saved: [], tasks: [], practice: [] }; }
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
    const isHistoryCurriculum = requestedSubject === "History" && grade.value === "10" && !!window.MINA_G10_HISTORY;
    document.querySelector(".content-grid").classList.toggle("history-mode", isHistoryCurriculum);
    document.querySelector(".subjects-panel > .notice").hidden = isHistoryCurriculum;
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
    root.classList.remove("subject-detail", "history-curriculum");
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
    if (subject === "History" && grade.value === "10" && window.MINA_G10_HISTORY) {
      renderGrade10History();
      return;
    }
    const root=$("subjects");root.replaceChildren();
    root.classList.remove("history-curriculum");
    root.classList.add("subject-detail");
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
  function renderGrade10History(lessonIndex = null) {
    const root = $("subjects");
    const curriculum = window.MINA_G10_HISTORY;
    const lessons = curriculum.completeLessons;
    const requestedLesson = new URLSearchParams(location.search).get("lesson");
    if (lessonIndex === null && requestedLesson) {
      const index = lessons.findIndex(lesson => lesson.number === requestedLesson);
      if (index >= 0) lessonIndex = index;
    }
    root.replaceChildren();
    root.classList.add("subject-detail", "history-curriculum");
    const back = document.createElement("a");
    back.className = "button-secondary";
    back.href = `/learning/?${new URLSearchParams({grade: grade.value, stream: stream.value})}`;
    back.textContent = "← All subjects";
    back.addEventListener("click", event => {
      event.preventDefault(); requestedSubject = null;
      history.pushState({}, "", back.href); renderSubjects();
    });
    root.append(back);
    const heading = document.createElement("h2");
    heading.textContent = "Grade 10 · History";
    root.append(heading);
    const citation = document.createElement("p");
    citation.className = "curriculum-source";
    citation.append(document.createTextNode(`${curriculum.source.publisher}, ${curriculum.source.title} (${curriculum.source.edition}). `));
    const sourceLink = document.createElement("a");
    sourceLink.href = curriculum.source.url; sourceLink.target = "_blank";
    sourceLink.rel = "noopener noreferrer"; sourceLink.textContent = "Open reference textbook";
    citation.append(sourceLink, document.createTextNode(` ${curriculum.source.note}`));
    root.append(citation);

    if (lessonIndex === null) {
      const coverage = document.createElement("p");
      coverage.className = "notice";
      coverage.textContent = "Current coverage: Unit 1 only. Units 2–9 are not yet implemented. These original AI-authored lessons and practice questions are separate from the educator-reviewed exam bank.";
      root.append(coverage);
      const units = [...new Set(lessons.map(lesson => lesson.unit))];
      units.forEach(unitNumber => {
        const unitLessons = lessons.filter(lesson => lesson.unit === unitNumber);
        const unit = document.createElement("details"); unit.open = true;
        unit.className = "history-unit-card";
        const summary = document.createElement("summary");
        summary.textContent = `Unit ${unitNumber} · ${unitLessons[0].unitTitle}`;
        const note = document.createElement("p"); note.className = "muted";
        note.textContent = `${unitLessons.length} learning pages · ${unitLessons.reduce((sum, lesson) => sum + lesson.questions.length, 0)} original practice questions`;
        unit.append(summary, note);
        unitLessons.forEach(lesson => {
          const open = document.createElement("a"); open.className = "history-lesson-link";
          open.href = `/learning/?${new URLSearchParams({grade: "10", stream: "social", subject: "History", lesson: lesson.number})}`;
          open.textContent = `${lesson.number} · ${lesson.title}${state.completed.includes(`curriculum:history:10:${lesson.number}`) ? " · Completed ✓" : ""}`;
          unit.append(open);
        });
        root.append(unit);
      });
      return;
    }

    const lesson = lessons[lessonIndex];
    const key = `curriculum:history:10:${lesson.number}`;
    const lessonUrl = new URL(location.href); lessonUrl.searchParams.set("lesson", lesson.number);
    history.replaceState({}, "", lessonUrl);
    const contents = document.createElement("a"); contents.className = "button-secondary";
    const contentsUrl = new URL(location.href); contentsUrl.searchParams.delete("lesson");
    contents.href = contentsUrl.pathname + contentsUrl.search; contents.textContent = "← Unit contents";
    root.append(contents);
    const title = document.createElement("h3");
    title.textContent = `Unit ${lesson.unit} · Lesson ${lesson.number}: ${lesson.title}`;
    root.append(title);
    const addSection = (headingText, content, className = "") => {
      const section = document.createElement("section");
      section.className = `history-lesson-section ${className}`.trim();
      const h = document.createElement("h4"); h.textContent = headingText; section.append(h);
      if (Array.isArray(content)) {
        const list = document.createElement("ul");
        content.forEach(item => {
          const li = document.createElement("li");
          if (Array.isArray(item)) {
            const strong = document.createElement("strong"); strong.textContent = `${item[0]}: `;
            li.append(strong, document.createTextNode(item[1]));
          } else li.textContent = item;
          list.append(li);
        });
        section.append(list);
      } else {
        const p = document.createElement("p"); p.textContent = content; section.append(p);
      }
      root.append(section);
    };
    addSection("Introduction", lesson.introduction);
    addSection("Learning objectives", lesson.objectives);
    lesson.topics.forEach(topic => {
      addSection(topic.title, topic.notes);
      addSection("Key terms", topic.terms, "compact-section");
      addSection("Historical/economic example", topic.example, "example-section");
    });
    addSection("Practice exercises", lesson.exercises);
    addSection("Lesson summary", lesson.summary);
    addSection("Revision questions", lesson.revision);
    const source = document.createElement("p");
    source.className = "curriculum-source"; source.textContent = `Reference: ${curriculum.source.title}, Unit ${lesson.unit}, section ${lesson.number}. Original learning text; not copied from the textbook.`;
    root.append(source);

    const actions = document.createElement("div"); actions.className = "history-lesson-actions";
    const save = document.createElement("button"); save.type = "button";
    const savedIndex = state.saved.findIndex(item => item.key === key);
    save.textContent = savedIndex >= 0 ? "★ Saved lesson" : "☆ Save lesson";
    save.addEventListener("click", () => {
      const index = state.saved.findIndex(item => item.key === key);
      if (index >= 0) state.saved.splice(index, 1);
      else state.saved.unshift({key, subject: "History", title: lesson.title});
      persist(); renderSaved(); updateStats(); save.textContent = index >= 0 ? "☆ Save lesson" : "★ Saved lesson";
    });
    const complete = document.createElement("button"); complete.type = "button";
    complete.textContent = state.completed.includes(key) ? "Completed ✓" : "Mark complete";
    complete.setAttribute("aria-describedby", "history-review-note");
    complete.addEventListener("click", () => {
      if (!state.completed.includes(key)) state.completed.push(key);
      persist(); updateStats(); complete.textContent = "Completed ✓";
      note.textContent = "Study completion saved. This records your progress, not an official assessment or educator approval.";
    });
    const practice = document.createElement("button"); practice.type = "button";
    practice.textContent = "Practice questions";
    const note = document.createElement("p");
    note.id = "history-review-note"; note.className = "muted";
    note.textContent = "You have opened the actual lesson content. Mark complete after studying it. Educator review of this AI-authored material is still pending.";
    actions.append(save, complete, practice); root.append(actions, note);

    const quiz = document.createElement("section");
    quiz.className = "history-quiz"; quiz.hidden = true; quiz.setAttribute("aria-live", "polite");
    root.append(quiz);
    let questionIndex = 0, score = 0, answered = false;
    const showQuestion = () => {
      quiz.replaceChildren();
      if (questionIndex >= lesson.questions.length) {
        state.practice.unshift({id: crypto.randomUUID(), lesson: lesson.number, subject: "History", grade: 10, score, total: lesson.questions.length, completedAt: new Date().toISOString(), kind: "ai_authored"});
        state.practice = state.practice.slice(0, 50);
        persist(); loadQuizProgress();
        const h = document.createElement("h4"); h.textContent = `Practice complete · ${score} / ${lesson.questions.length}`;
        const retry = document.createElement("button"); retry.type = "button"; retry.textContent = "Try again";
        retry.addEventListener("click", () => { questionIndex = 0; score = 0; answered = false; showQuestion(); });
        quiz.append(h, retry); return;
      }
      const q = lesson.questions[questionIndex];
      const h = document.createElement("h4"); h.textContent = `Question ${questionIndex + 1} of ${lesson.questions.length}`;
      const prompt = document.createElement("p"); prompt.textContent = q.prompt; quiz.append(h, prompt);
      const feedback = document.createElement("p"); feedback.className = "quiz-feedback"; feedback.hidden = true;
      q.choices.forEach((choice, index) => {
        const button = document.createElement("button"); button.type = "button";
        button.className = "history-choice"; button.textContent = `${String.fromCharCode(65 + index)}. ${choice.replace(/^[A-D]\.\s*/, "")}`;
        button.addEventListener("click", () => {
          if (answered) return;
          answered = true;
          const correct = index === q.answer; if (correct) score++;
          feedback.hidden = false;
          feedback.textContent = `${correct ? "Correct." : "Not quite."} Correct answer: ${String.fromCharCode(65 + q.answer)}. ${q.choices[q.answer].replace(/^[A-D]\.\s*/, "")} ${q.explanation}`;
          const next = document.createElement("button"); next.type = "button";
          next.textContent = questionIndex === lesson.questions.length - 1 ? "See score" : "Next question";
          next.addEventListener("click", () => { questionIndex++; answered = false; showQuestion(); });
          quiz.append(feedback, next);
          quiz.querySelectorAll(".history-choice").forEach(option => { option.disabled = true; });
        });
        quiz.append(button);
      });
    };
    practice.addEventListener("click", () => { quiz.hidden = false; questionIndex = 0; score = 0; answered = false; showQuestion(); quiz.scrollIntoView({behavior: "smooth", block: "start"}); });
    const nav = document.createElement("div"); nav.className = "history-lesson-actions";
    const previous = document.createElement("button"); previous.type = "button"; previous.textContent = "Previous lesson"; previous.disabled = lessonIndex === 0;
    previous.addEventListener("click", () => renderGrade10History(lessonIndex - 1));
    const next = document.createElement("button"); next.type = "button"; next.textContent = "Next lesson"; next.disabled = lessonIndex >= lessons.length - 1;
    next.addEventListener("click", () => renderGrade10History(lessonIndex + 1));
    nav.append(previous, next); root.append(nav);
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
    const lessonGrade = Number(lesson.grade) || Number(grade.value);
    $("lesson-subject").textContent = `GRADE ${lessonGrade} · ${lesson.subject}`;
    $("lesson-title").textContent = lesson.title;
    $("lesson-content").textContent = lesson.content || "This is a study organizer, not a verified lesson. Use your textbook or ask the AI tutor for an explanation.";
    const source=$("lesson-source");source.replaceChildren();
    source.append(document.createTextNode(lesson.sourceLabel ? `Source: ${lesson.sourceLabel}` : "No reviewed lesson source is attached to this study prompt."));
    if(lesson.sourceUrl){const link=document.createElement("a");link.href=lesson.sourceUrl;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Open source";source.append(document.createTextNode(" · "),link);}
    const examples = lesson.examples || [], points = lesson.keyPoints || [];
    $("lesson-examples-wrap").hidden = !examples.length; $("lesson-points-wrap").hidden = !points.length;
    $("lesson-examples").replaceChildren(...examples.map(text => { const li=document.createElement("li");li.textContent=text;return li; }));
    $("lesson-points").replaceChildren(...points.map(text => { const li=document.createElement("li");li.textContent=text;return li; }));
    const query = new URLSearchParams({grade:String(lessonGrade),stream:lesson.stream || stream.value,subject:lesson.subject,topic:lesson.chapter||""});
    $("practice-lesson").href = `/exams/?${query.toString()}`;
    const saved = state.saved.some(item => item.key === lesson.key);
    $("save-lesson").textContent = saved ? "★ Saved" : "☆ Save lesson";
    const hasReviewedContent = lesson.isPublishedLesson === true &&
      typeof lesson.content === "string" && lesson.content.trim().length >= 80 &&
      typeof lesson.sourceLabel === "string" && lesson.sourceLabel.trim().length > 0;
    const completeButton = $("complete-lesson");
    completeButton.disabled = !hasReviewedContent;
    completeButton.textContent = state.completed.includes(lesson.key) ? "Completed ✓" : "Mark complete";
    $("lesson-completion-note").textContent = hasReviewedContent
      ? "After studying this reviewed lesson, confirm to record it as completed."
      : "This is a study prompt, not a complete reviewed lesson. Completion is unavailable.";
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
      const open=document.createElement("button");open.type="button";open.textContent="Open lesson";open.addEventListener("click",()=>openLesson({...lesson,isPublishedLesson:true,key:`lesson:${lesson.id}`}));
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
    root.replaceChildren();
    state.practice.slice(0,8).forEach(attempt=>{
      const item=document.createElement("p");
      item.textContent=`AI-authored practice · Grade ${attempt.grade} ${attempt.subject} · Lesson ${attempt.lesson} · ${attempt.score}/${attempt.total}`;
      root.append(item);
    });
    if (!accountSyncEnabled) {
      const note = document.createElement("p");
      note.textContent = state.practice.length
        ? "These practice scores are stored on this device. Sign in to sync learning data and view exam results."
        : "Sign in to save and view exam scores. Original lesson practice scores can be kept on this device.";
      root.append(note);
      return;
    }
    try{const r=await fetch("/api/exams/history",{credentials:"same-origin"});const data=await r.json();if(!r.ok)throw new Error(data?.error?.message||"Sign in to view saved quiz results.");
      if(!data.attempts.length&&!state.practice.length){root.textContent="No saved quiz results yet. Start a practice set to record your score.";return;}
      data.attempts.slice(0,8).forEach(attempt=>{const item=document.createElement("p");item.textContent=`Grade ${attempt.grade} · ${attempt.subject||"All subjects"} · ${attempt.score}/${attempt.total}`;root.append(item);});
    }catch{const note=document.createElement("p");note.textContent=state.practice.length?"These practice scores are stored on this device. Sign in to sync learning data and view exam results.":"Sign in to save and view exam scores. Original lesson practice scores can be kept on this device.";root.append(note);}
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
    const hasReviewedContent = current.isPublishedLesson === true &&
      typeof current.content === "string" && current.content.trim().length >= 80 &&
      typeof current.sourceLabel === "string" && current.sourceLabel.trim().length > 0;
    if (!hasReviewedContent || !window.confirm("Have you studied this reviewed lesson and want to mark it complete?")) return;
    if (!state.completed.includes(current.key)) state.completed.push(current.key);
    persist(); $("complete-lesson").textContent = "Completed ✓"; renderSubjects();
  });
  function renderSaved() {
    const root = $("saved-lessons"); root.replaceChildren();
    if (!state.saved.length) { const empty = document.createElement("p"); empty.className = "muted"; empty.textContent = "Save a lesson from a subject to find it here."; root.append(empty); return; }
    state.saved.forEach((item, i) => {
      const chip = document.createElement("div"); chip.className = "saved-chip";
      if (item.key?.startsWith("curriculum:history:10:")) {
        const open = document.createElement("a");
        open.href = `/learning/?${new URLSearchParams({grade:"10",stream:"social",subject:"History",lesson:item.key.slice("curriculum:history:10:".length)})}`;
        open.textContent = `${item.subject}: ${item.title}`; chip.append(open);
      } else chip.append(document.createTextNode(`${item.subject}: ${item.title}`));
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
  loadLessons(); loadQuizProgress();
  (async()=>{
    try{
      const status=await fetch("/api/account/status",{credentials:"same-origin"}).then(r=>r.json());
      if(!status.signedIn)return;
      const result=await fetch("/api/account/data",{credentials:"same-origin"}).then(r=>r.json());
      if (result.records?.learning && typeof result.records.learning === "object") {
        const remote = result.records.learning;
        state.completed = [...new Set([...(remote.completed || []), ...state.completed])];
        const savedByKey = new Map([...(remote.saved || []), ...state.saved].map(item => [item.key, item]));
        const tasksByText = new Map([...(remote.tasks || []), ...state.tasks].map(item => [item.text, item]));
        state.saved = [...savedByKey.values()];
        state.tasks = [...tasksByText.values()];
        state.practice = [...new Map([...(remote.practice || []), ...state.practice].map(item => [item.id, item])).values()].sort((a,b) => String(b.completedAt).localeCompare(String(a.completedAt))).slice(0,50);
        state.settings = { ...(remote.settings || {}), ...state.settings };
        if (!routeGrade) grade.value = String(state.settings.grade || "9");
        if (!routeStream) stream.value = state.settings.stream || "natural";
      }
      accountSyncEnabled = true;
      persist(); renderSubjects(); renderTasks(); renderSaved(); loadLessons(); await loadQuizProgress();
    }catch{}
  })();
})();
