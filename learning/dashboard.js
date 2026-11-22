import {api,createStore,topicIsComplete} from "./learning-state.js";
import {node,lessonUrl,courseUrl,practiceUrl,topicParams,renderLesson} from "./lesson-view.js";
import {getOfflineStorageUsage,listOfflineDownloads,makeOfflineCourseDownload,makeOfflineGradeDownload,removeOfflineDownload} from "./offline-store.js";
import {buildStudentAnalytics} from "./analytics.js";

const $=id=>document.getElementById(id);
const store=createStore(message=>{$("sync-status").textContent=message;});
const root=$("subjects");
let scope,catalog,course,renderVersion=0,libraryVersion=0,libraryOffset=0;
let examHistory=[],topicOutcomes=[],examError="";
const catalogs=new Map();
function dashboardUrl() {
  return `/learning/?${new URLSearchParams({grade:String(scope?.grade || 9),language:scope?.language || "en",stream:$("stream").value || "natural"})}`;
}
function button(text,action) {const b=node("button",text,"button-secondary");b.type="button";b.addEventListener("click",action);return b;}
function link(text,href,className="button-secondary"){const a=node("a",text,className);a.href=href;return a;}
function errorView(error) {
  root.replaceChildren(node("h2","Learning content could not be opened"),node("p",error.message,"notice"),
    link("Back to dashboard",dashboardUrl()),button("Retry",()=>loadPage(true)));
}
function availableKeys() {return new Set((catalog?.subjects || []).flatMap(subject=>subject.availableKeys));}
function updateProgress() {
  const keys=availableKeys();
  const completed=store.state.completed.filter(key=>keys.has(key)).length;
  $("completed-count").textContent=catalog?completed:"—";
  $("remaining-count").textContent=catalog?Math.max(0,keys.size-completed):"—";
  $("saved-count").textContent=store.state.saved.length;
  $("task-count").textContent=store.state.tasks.filter(task=>!task.done).length;
  $("coverage-status").textContent=catalog
    ? `${completed} completed · ${Math.max(0,keys.size-completed)} remaining of ${keys.size} available lessons in Grade ${scope.grade} (${({en:"English",om:"Afaan Oromoo",am:"Amharic"})[scope.language]}). Counts reflect available content, not full textbook coverage.`
    : "Availability could not be confirmed. Progress totals are not available.";
  const topicKeys=(catalog?.subjects || []).flatMap(subject=>subject.availableTopicKeys || []);
  const studied=topicKeys.filter(key=>topicIsComplete(store.state,key)).length;
  $("topic-coverage-status").textContent=catalog
    ? `${studied} of ${topicKeys.length} available topics studied · ${topicKeys.length-studied} topics remaining.`
    : "Topic availability could not be confirmed.";
}
function changed() {updateProgress();renderSaved();renderResults();renderAnalytics();}
function appendCell(row,value,tag="td") {row.append(node(tag,String(value)));}
function renderPeriodSummary(id,rows) {
  const box=$(id);box.replaceChildren();
  if(!rows.length){box.append(node("p","No dated lessons or completed practice in this period yet.","muted"));return;}
  const wrapper=node("div",undefined,"analytics-table-wrap"),table=node("table",undefined,"analytics-table");
  const head=node("tr");
  for(const label of ["Grade","Subject","Lessons","Practice","Accuracy"])appendCell(head,label,"th");
  const thead=node("thead");thead.append(head);table.append(thead);
  const body=node("tbody");
  rows.forEach(row=>{
    const tr=node("tr");
    appendCell(tr,row.grade===null?"All grades":`Grade ${row.grade}`);
    appendCell(tr,row.subject);
    appendCell(tr,row.lessonCount);
    appendCell(tr,row.attemptCount);
    appendCell(tr,row.accuracy===null?"—":`${Math.round(row.accuracy*100)}%`);
    body.append(tr);
  });
  table.append(body);wrapper.append(table);box.append(wrapper);
}
function renderAnalytics() {
  const analytics=buildStudentAnalytics({
    now:Date.now(),completionEvents:store.state.completionEvents,completedLessons:store.state.completed,
    completedTopics:store.state.completedTopics,practiceResults:store.state.practice,examAttempts:examHistory,topicOutcomes,
  });
  renderPeriodSummary("weekly-summary",analytics.periods.weekly);
  renderPeriodSummary("monthly-summary",analytics.periods.monthly);
  const note=$("analytics-data-note");
  note.textContent="Summaries use saved lesson completions and completed practice or exam results from the past 7 and 30 days, grouped by grade and subject. Older lesson completions without a recorded date stay in all-time totals but cannot be assigned to a period.";
  if(!store.signedIn)note.textContent+=" Signed-out results include only data saved on this device.";
  const error=$("analytics-error");
  error.hidden=!examError;
  error.textContent=examError?`Some account exam data could not be loaded: ${examError} Device-saved activity remains available.`:"";

  const strengths=$("strong-subjects");strengths.replaceChildren();
  if(!analytics.strongSubjects.length)strengths.append(node("p","Not enough recent results yet. A subject is highlighted after at least 3 completed results and 80% accuracy.","muted"));
  else analytics.strongSubjects.forEach(item=>strengths.append(node("p",`${item.grade===null?"All grades":`Grade ${item.grade}`} · ${item.subject} · ${Math.round(item.accuracy*100)}% across ${item.attemptCount} completed results`)));

  const topics=$("practice-topics");topics.replaceChildren();
  if(!analytics.topicsNeedingPractice.length)topics.append(node("p","No chapter-level results meet the review threshold in the past 30 days. Topic signals use completed reviewed exam questions; lesson-practice records contain total scores, not per-question answers.","muted"));
  else analytics.topicsNeedingPractice.forEach(item=>topics.append(node("p",`${item.grade===null?"All grades":`Grade ${item.grade}`} · ${item.subject} · ${item.chapter} · ${Math.round(item.accuracy*100)}% correct (${item.correctCount}/${item.questionCount})`)));

  const badges=$("achievement-list");badges.replaceChildren();
  analytics.badges.forEach(badge=>{
    const card=node("article",undefined,`achievement-card${badge.earned?" earned":""}`);
    card.append(node("strong",badge.title),node("p",badge.description,"muted"));
    const progress=node("progress");progress.max=badge.target;progress.value=Math.min(badge.value,badge.target);progress.setAttribute("aria-label",`${badge.title}: ${Math.min(badge.value,badge.target)} of ${badge.target}`);
    card.append(progress,node("small",badge.earned?"Earned":`${badge.value} / ${badge.target}`,"muted"));badges.append(card);
  });
}
function renderResults() {
  const box=$("quiz-progress");box.replaceChildren();
  const local=store.state.practice.filter(attempt=>attempt.grade===scope?.grade).slice(0,8);
  local.forEach(attempt=>box.append(node("p",`${attempt.kind==="published_lesson"?"Published lesson practice":attempt.kind==="offline_reviewed_exam"?"Downloaded reviewed offline practice":"AI-authored practice"} · ${attempt.grade?`Grade ${attempt.grade} `:""}${attempt.subject} · ${attempt.lesson} · ${attempt.score}/${attempt.total}`)));
  examHistory.filter(attempt=>Number(attempt.grade)===scope?.grade).slice(0,8).forEach(attempt=>box.append(node("p",`Reviewed-bank ${attempt.mode || "practice"} · ${attempt.subject || "All subjects"} · ${attempt.score}/${attempt.total}`)));
  if(!box.children.length)box.append(node("p","No practice results for this grade yet."));
  if(examError)box.append(node("p",examError,"notice"));
  else if(!store.signedIn)box.append(node("p","Device practice results stay here. Sign in to sync private learning data and view account exam results."));
}
async function openSaved(item,message) {
  try {
    const id=item.id || (/^lesson:\d+$/.test(item.key)?`db-${item.key.slice(7)}`:
      item.key.startsWith("curriculum:history:10:")?`history10-${item.key.slice("curriculum:history:10:".length)}`:null);
    if(!id)throw new Error("This legacy saved entry has no actual lesson ID. It was preserved, but cannot be opened as a lesson.");
    const {lesson}=await api(`/api/learning/content/${encodeURIComponent(id)}`);
    location.href=lessonUrl(lesson,topicParams(item.topicIndex));
  } catch(error) {message.textContent=error.message;}
}
function renderSaved() {
  for(const [collection,id] of [["saved","saved-lessons"],["bookmarks","bookmarked-topics"]]) {
    const box=$(id);box.replaceChildren();
    if(!store.state[collection].length){box.append(node("p",collection==="saved"?"No saved lessons yet.":"No bookmarked topics yet.","muted"));continue;}
    store.state[collection].forEach(item=>{
      const row=node("div",undefined,"saved-chip");
      const message=node("p",undefined,"muted");message.setAttribute("role","status");
      const open=button(`${item.subject || "Learning"}: ${item.title}`,()=>openSaved(item,message));
      const remove=button("Remove",()=>{store.toggle(collection,item);changed();});
      remove.setAttribute("aria-label",`Remove ${item.title}`);
      row.append(open,remove,message);box.append(row);
    });
  }
}
async function renderOfflineDownloads() {
  const box=$("offline-download-list");box.replaceChildren();
  try {
    const [downloads,usage]=await Promise.all([listOfflineDownloads(),getOfflineStorageUsage()]);
    $("offline-storage-usage").textContent=`${(usage.bytes/1024/1024).toFixed(1)} MB / ${(usage.limitBytes/1024/1024).toFixed(0)} MB · ${usage.lessonCount} lessons · ${usage.questionSetCount} question sets · ${usage.resultCount} results`;
    if(!downloads.length){box.append(node("p","No offline downloads yet. Open a lesson or practice page while online to save content.","muted"));return;}
    downloads.forEach(item=>{
      const row=node("div",undefined,"saved-chip");
      const updated=Number.isFinite(Date.parse(item.updatedAt))?new Date(item.updatedAt).toLocaleString():"date unavailable";
      const message=node("p",`${(item.bytes/1024/1024).toFixed(1)} MB · saved ${updated} · may be out of date; reconnect and download again to refresh`,"muted");
      const metadata=item.data || {};
      const open=item.type==="lesson"
        ? link(item.title,lessonUrl({id:metadata.id,grade:metadata.grade,subject:metadata.subject,language:metadata.language}))
        : node("p",item.title);
      const remove=button("Remove download",async()=>{
        remove.disabled=true;
        try {await removeOfflineDownload(item.resourceKey);await renderOfflineDownloads();}
        catch(error){message.textContent=error.message;remove.disabled=false;}
      });
      row.append(open,remove,message);box.append(row);
    });
  } catch(error) {box.append(node("p",error.message,"notice"));}
}
async function downloadSubject(subject, buttonNode) {
  const status=$("offline-bulk-status");
  buttonNode.disabled=true;status.textContent=`Downloading available Grade ${scope.grade} ${subject} lessons…`;
  try {
    const result=await makeOfflineCourseDownload({
      grade:scope.grade,subject,language:scope.language,
      onProgress:progress=>{status.textContent=`${subject}: saved ${progress.completed} of ${progress.total} lessons. Current: ${progress.title}`;},
    });
    status.textContent=`${subject}: ${result.completed} of ${result.total} lessons saved offline.${result.errors.length?` ${result.errors.length} could not be saved; ${result.errors[0]}`:""}`;
    await renderOfflineDownloads();
  } catch(error) {status.textContent=error.message;}
  finally {buttonNode.disabled=false;}
}
function renderTasks() {
  $("task-list").replaceChildren();
  store.state.tasks.forEach((task,index)=>{
    const row=node("li",undefined,`task${task.done?" done":""}`);
    const checkbox=node("input");checkbox.type="checkbox";checkbox.checked=!!task.done;checkbox.setAttribute("aria-label",`Complete ${task.text}`);
    checkbox.addEventListener("change",()=>{task.done=checkbox.checked;store.save();renderTasks();updateProgress();});
    row.append(checkbox,node("span",task.text),button("Remove",()=>{
      store.state.removedTasks.push(task.id || `legacy:${task.text}`);
      store.state.tasks.splice(index,1);store.save();renderTasks();updateProgress();
    }));
    $("task-list").append(row);
  });
}
function breadcrumbs() {
  root.append(link("← Back to dashboard",dashboardUrl()));
  if(scope.subject)root.append(node("p",`Grade ${scope.grade} · ${scope.subject}`,"eyebrow"));
}
function appendPracticeLinks(container,subject) {
  const target={...scope,subject:subject.name,practiceStream:subject.practiceStream};
  if(subject.practiceLessonId) {
    container.append(link("Start lesson practice",lessonUrl({...target,id:subject.practiceLessonId},{practice:"1"}),"subject-practice"));
    container.append(node("small",`${subject.practiceQuestionCount} lesson-practice questions across available lessons. Source and review status are shown on each lesson.`,"muted"));
  }
  if(subject.reviewedQuestionCount>0) {
    container.append(link(`Reviewed exam practice (${subject.reviewedQuestionCount} questions)`,practiceUrl(target),"subject-practice"));
  } else if(!subject.practiceLessonId) {
    container.append(link("Check exam availability",practiceUrl(target),"subject-practice"));
  }
}
function renderDashboard() {
  root.className="subject-grid";
  root.replaceChildren();
  catalog.subjects.forEach(subject=>{
    const wrapper=node("article",undefined,"course-card");
    const target={...scope,subject:subject.name};
    const a=link("",courseUrl(target),"subject-card");
    a.setAttribute("aria-label",`Open ${subject.name}, Grade ${scope.grade}`);
    const completed=subject.availableKeys.filter(key=>store.state.completed.includes(key)).length;
    a.append(node("h3",subject.name),node("small",subject.lessonCount
      ? `${subject.chapterCount} chapter${subject.chapterCount===1?"":"s"} · ${completed}/${subject.lessonCount} completed · ${subject.lessonCount-completed} remaining`
      : "Learning content is not available yet"),node("span","Open subject →"));
    if(subject.lessonCount) {
      const topicKeys=subject.availableTopicKeys || [];
      const studied=topicKeys.filter(key=>topicIsComplete(store.state,key)).length;
      a.append(node("small",`${studied}/${topicKeys.length} topics studied · ${topicKeys.length-studied} remaining`));
    }
    wrapper.append(a);
    const downloadSubjectButton=button("Download subject offline",()=>downloadSubject(subject.name,downloadSubjectButton));
    downloadSubjectButton.setAttribute("aria-label",`Download Grade ${scope.grade} ${subject.name} offline`);
    wrapper.append(downloadSubjectButton);
    if(subject.startLessonId)wrapper.append(link("Start learning",lessonUrl({...target,id:subject.startLessonId}),"subject-open"));
    appendPracticeLinks(wrapper,subject);
    root.append(wrapper);
  });
}
function renderCourse(chapterId) {
  root.replaceChildren();breadcrumbs();
  root.append(node("h2",`${scope.subject} · Chapters and lessons`));
  root.append(node("p","Only chapters with actual learning content are listed. Drafts and unavailable textbook chapters are not presented as lessons.","muted"));
  const summary=catalog.subjects.find(subject=>subject.name===scope.subject);
  if(summary)appendPracticeLinks(root,summary);
  if(chapterId&&!course.chapters.some(chapter=>chapter.id===chapterId))throw new Error("This chapter does not belong to the selected grade and subject.");
  if(!course.chapters.length) {
    root.append(node("div",`No learning content is published for Grade ${scope.grade} ${scope.subject} in ${({en:"English",om:"Afaan Oromoo",am:"Amharic"})[scope.language]} yet. This is a missing-content notice, not a lesson. Other grades and subjects remain accessible.`,"notice"));
    return;
  }
  if(chapterId)root.append(link("All chapters",courseUrl(scope)));
  if(chapterId) {
    const index=course.chapters.findIndex(chapter=>chapter.id===chapterId);
    const nav=node("nav",undefined,"history-lesson-actions");nav.setAttribute("aria-label","Chapter navigation");
    for(const [offset,label] of [[-1,"Previous chapter"],[1,"Next chapter"]]) {
      const target=course.chapters[index+offset];
      if(target)nav.append(link(label,courseUrl(scope,{chapter:target.id})));
      else {const unavailable=button(label,()=>{});unavailable.disabled=true;nav.append(unavailable);}
    }
    root.append(nav);
  }
  for(const chapter of course.chapters.filter(chapter=>!chapterId || chapter.id===chapterId)) {
    const panel=node("details",undefined,"history-unit-card");panel.open=!!chapterId || course.chapters.length===1;
    const title=chapter.title.match(/^\d+[.\s]/)?chapter.title:`${chapter.number}. ${chapter.title}`;
    panel.append(node("summary",title),link("Open chapter",courseUrl(scope,{chapter:chapter.id}),"subject-open"));
    const done=chapter.lessons.filter(lesson=>store.state.completed.includes(lesson.key)).length;
    panel.append(node("p",`${done} completed · ${chapter.lessons.length-done} remaining`,"muted"));
    chapter.lessons.forEach(lesson=>{
      const a=link(`${lesson.number} · ${lesson.title}${store.state.completed.includes(lesson.key)?" · Completed ✓":""}`,lessonUrl(lesson),"history-lesson-link");
      panel.append(a);
      if(lesson.topicOutline?.length) {
        const topics=node("details",undefined,"lesson-topics");
        topics.append(node("summary",`${lesson.topicOutline.length} learning topics`));
        lesson.topicOutline.forEach(topic=>{
          const topicLink=link(topic.title,lessonUrl(lesson,{topic:topic.id}),"topic-link");
          topicLink.dataset.topicId=topic.id;topics.append(topicLink);
        });
        panel.append(topics);
      }
    });
    panel.append(link("Start learning",lessonUrl(chapter.lessons[0]),"subject-open"));
    root.append(panel);
  }
}
async function loadPage(force=false) {
  const version=++renderVersion;
  root.className="subject-detail history-curriculum";
  root.replaceChildren(node("p","Loading learning catalog…","muted"));
  catalog=null;course=null;
  const params=new URLSearchParams(location.search);
  const rawGrade=params.get("grade") || store.state.settings.grade;
  const language=params.get("language") || store.state.settings.language || "en";
  scope={grade:Number(rawGrade),language,subject:params.get("subject") || ""};
  if(scope.subject==="Civics")scope.subject="Civics and Ethics";
  try {
    if(![9,10,11,12].includes(scope.grade) || !["en","om","am"].includes(language))throw new Error("Invalid grade or language. Choose Grades 9–12 and a supported language.");
    $("grade").value=String(scope.grade);$("language").value=language;$("lesson-language").value=language;
    $("stream").value=params.get("stream") || store.state.settings.stream || "natural";
    if(!$("stream").value)throw new Error("Invalid stream selection.");
    $("grade-label").textContent=scope.grade;$("stream-label").textContent="ALL SUBJECTS";
    const cacheKey=`${scope.grade}:${language}`;
    const data=!force&&catalogs.has(cacheKey)?catalogs.get(cacheKey):await api(`/api/learning/catalog?${new URLSearchParams({grade:String(scope.grade),language})}`);
    if(version!==renderVersion)return;
    catalog=data;catalogs.set(cacheKey,data);
    if(scope.subject&&!catalog.subjects.some(subject=>subject.name===scope.subject))throw new Error("Unknown subject. Please choose a subject from the dashboard.");
    const filter=$("lesson-subject-filter"),previous=filter.value;filter.replaceChildren(node("option","All subjects"));filter.firstChild.value="";
    catalog.subjects.forEach(subject=>{const option=node("option",subject.name);option.value=subject.name;filter.append(option);});filter.value=previous;
    const inCourse=!!scope.subject;
    document.body.classList.toggle("reading-lesson",inCourse&&params.has("lesson"));
    document.querySelector(".content-grid").classList.toggle("history-mode",inCourse);
    document.querySelector(".planner").hidden=inCourse;
    document.querySelector(".lesson-library").hidden=inCourse;
    if(!inCourse && (params.has("lesson")||params.has("chapter")||params.has("topic")))throw new Error("Select a subject before opening a lesson, chapter, or topic.");
    store.state.settings={grade:String(scope.grade),language,stream:$("stream").value};
    if(!inCourse)renderDashboard();
    else {
      const data=await api(`/api/learning/course?${new URLSearchParams({grade:String(scope.grade),language,subject:scope.subject})}`);
      if(version!==renderVersion)return;
      course=data;
      const requested=params.get("lesson");
      if(params.has("topic")&&!requested)throw new Error("Select a lesson before opening one of its topics.");
      if(requested) {
        const flat=course.chapters.flatMap(chapter=>chapter.lessons);
        const meta=flat.find(lesson=>lesson.id===requested || lesson.id===`db-${requested}` || lesson.origin==="ai_authored"&&lesson.number===requested);
        if(!meta)throw new Error("This lesson does not belong to the selected grade, subject, or language, or is not published.");
        if(params.has("chapter") && params.get("chapter")!==meta.chapterId)throw new Error("This lesson does not belong to the requested chapter.");
        const {lesson}=await api(`/api/learning/content/${encodeURIComponent(meta.id)}`);
        if(version!==renderVersion)return;
        if(lesson.grade!==scope.grade || lesson.subject!==scope.subject || lesson.language!==scope.language)throw new Error("The requested lesson does not match this course.");
        root.replaceChildren();breadcrumbs();
        root.append(link("← All chapters",courseUrl(scope)),link("Open chapter",courseUrl(scope,{chapter:meta.chapterId})));
        const body=node("article",undefined,"lesson-page");body.id="lesson-page";root.append(body);
        renderLesson({root:body,lesson:{...meta,...lesson},course,store,changed});
        const startPractice=params.get("practice")==="1" && (lesson.questions?.length || lesson.materialOutline?.some(material=>material.type==="mcq"));
        if(startPractice)body.querySelector("#start-practice").click();
        const topic=params.get("topic");
        if(!startPractice && topic!==null && /^[A-Za-z0-9_-]{1,80}$/.test(topic))requestAnimationFrame(()=>document.getElementById(`topic-${topic}`)?.scrollIntoView());
      } else renderCourse(params.get("chapter"));
    }
    updateProgress();renderSaved();renderTasks();renderResults();renderOfflineDownloads();
    renderAnalytics();
    if(!inCourse)loadLibrary();
  } catch(error) {if(version!==renderVersion)return;errorView(error);updateProgress();}
}
async function loadLibrary(append=false) {
  const version=++libraryVersion;
  if(!append){libraryOffset=0;$("lesson-list").replaceChildren();}
  $("lesson-status").textContent="Loading published lesson summaries…";$("load-more-lessons").hidden=true;
  const params=new URLSearchParams({grade:$("grade").value,language:$("lesson-language").value,summary:"1",offset:String(libraryOffset)});
  if($("lesson-subject-filter").value)params.set("subject",$("lesson-subject-filter").value);
  if($("lesson-search").value.trim())params.set("search",$("lesson-search").value.trim());
  try {
    const data=await api(`/api/learning/lessons?${params}`);
    if(version!==libraryVersion)return;
    for(const lesson of data.lessons) {
      const card=node("article",undefined,"lesson-card");
      card.append(node("p",`Grade ${lesson.grade} · ${lesson.subject} · ${lesson.chapter}`),node("h3",lesson.title),
        link("Open lesson",lessonUrl({...lesson,id:`db-${lesson.id}`}),"subject-open"));
      $("lesson-list").append(card);
    }
    $("lesson-status").textContent=$("lesson-list").children.length?`${$("lesson-list").children.length} published lesson summaries loaded.`:"No educator-published lessons match these filters. Drafts remain preserved and private to content managers.";
    libraryOffset=data.nextOffset;$("load-more-lessons").hidden=libraryOffset===null;
  } catch(error){if(version===libraryVersion)$("lesson-status").textContent=error.message;}
}
$("task-form").addEventListener("submit",event=>{
  event.preventDefault();const text=$("task-input").value.trim();if(!text)return;
  store.state.tasks.push({id:crypto.randomUUID(),text,done:false});store.save();$("task-input").value="";renderTasks();updateProgress();
});
for(const id of ["grade","stream","language"])$(id).addEventListener("change",()=>{
  const params=new URLSearchParams(location.search);
  params.set("grade",$("grade").value);params.set("stream",$("stream").value);params.set("language",$("language").value);
  for(const key of ["lesson","chapter","topic","material","practice"])params.delete(key);
  store.state.settings={grade:$("grade").value,stream:$("stream").value,language:$("language").value};store.save();
  history.pushState({},"",`/learning/?${params}`);loadPage();
});
$("retry-sync").addEventListener("click",async()=>{await store.retry();await loadPage();});
$("refresh-learning").addEventListener("click",()=>loadPage(true));
$("download-grade-offline").addEventListener("click",async event=>{
  const buttonNode=event.currentTarget,status=$("offline-bulk-status");
  buttonNode.disabled=true;status.textContent=`Downloading available Grade ${scope?.grade || $("grade").value} lessons…`;
  try {
    const result=await makeOfflineGradeDownload({
      grade:scope?.grade || Number($("grade").value),language:scope?.language || $("language").value,
      onProgress:progress=>{status.textContent=`${progress.subject}: saved ${progress.completed} of ${progress.total} lessons. Current: ${progress.title}`;},
    });
    status.textContent=`Grade ${scope?.grade || $("grade").value}: ${result.completed} of ${result.total} lessons saved across ${result.subjectCount} subjects.${result.errors.length?` ${result.errors.length} items could not be saved; ${result.errors[0]}`:""}`;
    await renderOfflineDownloads();
  } catch(error) {status.textContent=error.message;}
  finally {buttonNode.disabled=false;}
});
$("lesson-subject-filter").addEventListener("change",()=>loadLibrary());
$("lesson-language").addEventListener("change",()=>loadLibrary());
$("load-more-lessons").addEventListener("click",()=>loadLibrary(true));
let searchTimer;
$("lesson-search").addEventListener("input",()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadLibrary(),250);});
window.addEventListener("popstate",()=>loadPage());
await store.initialize();
window.addEventListener("online",()=>store.retry());
window.addEventListener("mina:offline-change",renderOfflineDownloads);
window.addEventListener("mina:offline-mode-change",event=>{
  if(!event.detail?.enabled)void store.retry();
});
await loadPage();
if(store.signedIn) {
  try {
    const history=await api("/api/exams/history");
    examHistory=Array.isArray(history.attempts)?history.attempts:[];
    topicOutcomes=Array.isArray(history.topicOutcomes)?history.topicOutcomes:[];
  }
  catch(error){examError=error.message;}
  renderResults();renderAnalytics();
}
