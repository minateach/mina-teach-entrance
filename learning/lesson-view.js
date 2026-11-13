import {api,topicIsComplete,practiceContentVersion,validPracticeDraft} from "./learning-state.js";
import {appendFullText,appendValue,mountMaterialReader} from "./material-reader.js";

export function node(tag,text,className) {
  const element=document.createElement(tag);
  if(text!==undefined) element.textContent=text;
  if(className) element.className=className;
  return element;
}
export function lessonUrl(lesson,extra={}) {
  return `/learning/?${new URLSearchParams({grade:String(lesson.grade),subject:lesson.subject,language:lesson.language || "en",lesson:lesson.id,...extra})}`;
}
export function courseUrl(course,extra={}) {
  return `/learning/?${new URLSearchParams({grade:String(course.grade),subject:course.subject,language:course.language || "en",...extra})}`;
}
export function topicParams(value) {
  const topic=value==null?"":String(value);
  return /^[A-Za-z0-9_-]{1,80}$/.test(topic)?{topic}:{};
}
export function practiceUrl(course,extra={}) {
  const social = ["Geography","History","Economics","Civics","Civics and Ethics","General Business"];
  const natural = ["Mathematics","Physics","Chemistry","Biology","Environmental Science","Basic Technical Drawing"];
  const stream = ["natural","social"].includes(course.practiceStream) ? course.practiceStream : social.includes(course.subject) ? "social" : natural.includes(course.subject) ? "natural" : course.stream === "social" ? "social" : "natural";
  return `/exams/?${new URLSearchParams({grade:String(course.grade),stream,subject:course.subject,returnTo:course.id?lessonUrl(course):courseUrl(course),...extra})}`;
}
export function sourceLink(url,text) {
  try { const parsed=new URL(url); if(!["https:","http:"].includes(parsed.protocol)) return null; }
  catch {return null;}
  const a=node("a",text);a.href=url;a.target="_blank";a.rel="noopener noreferrer";return a;
}
export function renderLesson({root,lesson,course,store,changed}) {
  root.replaceChildren();
  const requestedTopic=new URLSearchParams(location.search).get("topic");
  const flat=course.chapters.flatMap(chapter=>chapter.lessons);
  const position=flat.findIndex(item=>item.id===lesson.id);
  const title=node("h2",`${lesson.number?`${lesson.number} · `:""}${lesson.title}`);
  root.append(title,node("p",lesson.origin==="ai_authored"?"Original AI-authored learning material and practice. Independent educator review is pending; not an official examination paper.":"Educator-published learning material. Recorded sources are shown below.","notice"));
  const item={key:lesson.key,id:lesson.id,grade:lesson.grade,subject:lesson.subject,stream:lesson.stream,language:lesson.language,title:lesson.title};
  const studiedButtons=[];
  const outline=lesson.materialOutline || [],accessedMaterials=new Set();
  const requestedMaterial=new URLSearchParams(location.search).get("material");
  if(requestedMaterial!==null && !outline.some(material=>material.id===requestedMaterial))throw new Error("This material section does not belong to the selected lesson.");
  const topicDefinitions=lesson.topics?.length?lesson.topics.map((topic,index)=>({...topic,id:String(index)})):[{id:"0",title:lesson.title}];
  for(const material of outline)if(!topicDefinitions.some(topic=>topic.id===material.topicId))topicDefinitions.push({id:material.topicId,title:material.topicTitle || material.title,materialOnly:true});
  const selected=requestedTopic===null?-1:topicDefinitions.findIndex(topic=>topic.id===requestedTopic);
  if(requestedTopic!==null && selected<0)throw new Error("This topic does not belong to the selected lesson. Open its chapter and choose an available topic.");
  const topicStatus=node("p",undefined,"muted");topicStatus.id="lesson-topic-progress";
  const topicKeys=topicDefinitions.map(topic=>`${lesson.key}:topic:${topic.id}`);
  function updateTopicStatus() {
    const completed=topicKeys.filter(key=>topicIsComplete(store.state,key)).length;
    topicStatus.textContent=`${completed} of ${topicKeys.length} topics studied · ${topicKeys.length-completed} remaining`;
    studiedButtons.forEach(({button,key})=>{button.textContent=topicIsComplete(store.state,key)?"Topic completed ✓":"Mark topic complete";});
  }
  function updateContentAccess() {
    complete.disabled=typeof lesson.content!=="string" || lesson.content.trim().length<80 || outline.some(material=>!accessedMaterials.has(material.id));
    studiedButtons.forEach(({button,topicId})=>{button.disabled=outline.some(material=>material.topicId===topicId && !accessedMaterials.has(material.id));});
    accessStatus.textContent=outline.length
      ? `${accessedMaterials.size} of ${outline.length} additional material sections accessed. Open every section before marking the whole lesson complete.`
      : "All material currently supplied for this lesson is displayed below. This is not a claim of complete textbook coverage.";
  }
  const accessStatus=node("p",undefined,"muted");
  const makeButton=(text,callback)=>{const button=node("button",text);button.type="button";button.addEventListener("click",callback);return button;};
  const controls=node("div",undefined,"history-lesson-actions");
  const save=makeButton(store.state.saved.some(entry=>entry.key===lesson.key)?"★ Saved lesson":"☆ Save lesson",()=>{
    const saved=store.toggle("saved",item);save.textContent=saved?"★ Saved lesson":"☆ Save lesson";changed();
  });
  const complete=makeButton(store.state.completed.includes(lesson.key)?"Completed ✓":"Mark complete",()=>{
    if(!store.state.completed.includes(lesson.key))store.state.completed.push(lesson.key);
    store.save();complete.textContent="Completed ✓";changed();
    updateTopicStatus();
  });
  complete.id="complete-lesson";
  // This view is only built after successful detail loading; titles/failed requests cannot be completed.
  complete.disabled=typeof lesson.content!=="string" || lesson.content.trim().length<80;
  const practiceStatus=node("p",undefined,"muted");practiceStatus.setAttribute("role","status");
  const practice=makeButton("Start practice",async()=>{
    practice.disabled=true;
    try {
      await store.confirmPracticeIdentity();
      if(!lesson.questions?.length) {
        practiceStatus.textContent="Retrieving every MCQ section for this lesson…";
        const questions=[];
        for(let index=0;index<outline.length;index++)if(outline[index].type==="mcq") {
          const page=await api(`/api/learning/content/${encodeURIComponent(lesson.id)}/materials?offset=${index}&limit=1`);
          const material=page.materials[0];
          if(page.total!==outline.length || material?.id!==outline[index].id || !Array.isArray(material.choices) ||
            material.choices.length!==4 || !Number.isInteger(material.correctIndex) || material.correctIndex<0 ||
            material.correctIndex>3 || !material.explanation)throw new Error("The question material changed or is incomplete. Refresh the lesson; no questions were silently skipped.");
          questions.push({prompt:material.question,choices:material.choices,answer:material.correctIndex,explanation:material.explanation});
        }
        if(!questions.length)throw new Error("No complete MCQs are available for this lesson.");
        lesson.questions=questions;
      }
      practiceStatus.textContent=`${lesson.questions.length} lesson questions loaded. This is separate from the verified exam bank.`;
      quiz.hidden=false;offerPractice();quiz.scrollIntoView({behavior:"smooth",block:"start"});
    }catch(error){practiceStatus.textContent=error.message;}
    finally{practice.disabled=false;}
  });
  practice.id="start-practice";
  controls.append(save,complete);
  if(lesson.questions?.length || outline.some(material=>material.type==="mcq")) controls.append(practice);
  else {
    const link=node("a","Start practice","button-secondary");
    link.href=practiceUrl(lesson,{topic:lesson.chapter,returnTo:lessonUrl(lesson,topicParams(requestedTopic))});
    link.id="start-practice";controls.append(link);
  }
  root.append(controls,node("p","Completion records that you studied the content; it is not an official assessment.","muted"));
  root.append(topicStatus);
  root.append(accessStatus);
  root.append(practiceStatus);
  const topicNavigation=node("nav",undefined,"history-lesson-section");
  topicNavigation.setAttribute("aria-label","Topic navigation");
  topicNavigation.append(node("h3","Learning topics"));
  const topicLinks=node("ol");
  topicDefinitions.forEach(topic=>{
    const li=node("li"),a=node("a",topic.title);
    a.href=lessonUrl(lesson,{topic:topic.id});a.dataset.topicId=topic.id;
    if(topic.id===requestedTopic)a.setAttribute("aria-current","location");
    li.append(a);topicLinks.append(li);
  });
  topicNavigation.append(topicLinks);
  if(selected>=0) {
    const actions=node("div",undefined,"history-lesson-actions");
    for(const [offset,label] of [[-1,"Previous topic"],[1,"Next topic"]]) {
      const target=topicDefinitions[selected+offset];
      if(target){const a=node("a",label,"button-secondary");a.href=lessonUrl(lesson,{topic:target.id});actions.append(a);}
      else {const b=makeButton(label,()=>{});b.disabled=true;actions.append(b);}
    }
    const all=node("a","All lesson topics","button-secondary");all.href=lessonUrl(lesson);actions.append(all);
    topicNavigation.append(actions);
  }
  root.append(topicNavigation);
  function section(heading,value,elementId) {
    if(!value || Array.isArray(value)&&!value.length)return;
    const block=node("section",undefined,"history-lesson-section");
    if(elementId)block.id=elementId;
    block.append(node("h3",heading));
    if(Array.isArray(value)) {
      const list=node("ul");
      value.forEach(text=>{
        const li=node("li");
        if(Array.isArray(text))li.append(node("strong",`${text[0]}: `),document.createTextNode(text[1]));
        else appendValue(li,text);
        list.append(li);
      });block.append(list);
    } else appendValue(block,value);
    root.append(block);return block;
  }
  const introduction=section("Introduction",lesson.introduction,"topic-0");
  const fullNotes=lesson.content && lesson.content!==lesson.introduction?section("Complete lesson notes",lesson.content,"topic-0"):null;
  section("Learning objectives",lesson.objectives);
  let materialReader=null;
  topicDefinitions.forEach(topic=>{
    if(lesson.topics?.length || introduction&&fullNotes)introduction?.removeAttribute("id");
    if(lesson.topics?.length)fullNotes?.removeAttribute("id");
    let block=!lesson.topics?.length && topic.id==="0"?(fullNotes || introduction):section(topic.title,topic.notes,`topic-${topic.id}`);
    if(!block){block=node("section",undefined,"history-lesson-section");block.id=`topic-${topic.id}`;block.append(node("h3",topic.title));root.append(block);}
    if(topic.materialOnly) {
      const open=makeButton("Open this topic's material sections",()=>{
        materialReader?.open(outline.findIndex(material=>material.topicId===topic.id));
        materialReader?.root.scrollIntoView({behavior:"smooth",block:"start"});
      });
      block.append(open);
    }
    const bookmarkKey=`${lesson.key}:topic:${topic.id}`;
    const bookmark=makeButton(store.state.bookmarks.some(entry=>entry.key===bookmarkKey)?"★ Topic bookmarked":"Bookmark topic",()=>{
      const active=store.toggle("bookmarks",{...item,key:bookmarkKey,topicIndex:topic.id,title:`${lesson.title} · ${topic.title}`});
      bookmark.textContent=active?"★ Topic bookmarked":"Bookmark topic";changed();
    });
    block.append(bookmark);
    const studied=makeButton("",()=>{
      if(!topicIsComplete(store.state,bookmarkKey)) {
        store.state.completedTopics.push(bookmarkKey);
        store.save();changed();
      }
      updateTopicStatus();
    });
    studied.dataset.topicAction="complete";
    studiedButtons.push({button:studied,key:bookmarkKey,topicId:topic.id});
    block.append(studied);
    section("Important definitions",topic.terms);
    section("Example",topic.example);
    for(const [key,label] of Object.entries({subtopics:"Subtopics",concepts:"Concepts and principles",formulas:"Formulas",tables:"Tables",diagrams:"Diagrams",resources:"Additional resources"}))section(label,topic[key]);
  });
  updateContentAccess();
  materialReader=mountMaterialReader(root,lesson,id=>{accessedMaterials.add(id);updateContentAccess();});
  section("Examples and worked solutions",lesson.examples);
  section("Important notes",lesson.keyPoints);
  section("Exercises",lesson.exercises);
  section("Exercise answers and explanations",lesson.exerciseAnswers);
  section("Lesson summary",lesson.summary);
  section("Revision questions",lesson.revision);
  section("Revision answers and explanations",lesson.revisionAnswers);
  section("Additional resources",lesson.resources);
  if(lesson.questions?.length) {
    const all=node("section",undefined,"history-lesson-section");all.id="all-lesson-mcqs";
    all.append(node("h3",`All ${lesson.questions.length} lesson MCQs and explanations`));
    const questions=node("ol");
    lesson.questions.forEach(question=>{
      const item=node("li");appendFullText(item,question.prompt);
      const choices=node("ol");choices.type="A";
      question.choices.forEach(choice=>{const option=node("li");appendFullText(option,choice);choices.append(option);});
      const answer=node("details");answer.append(node("summary","Correct answer and detailed explanation"));
      appendFullText(answer,`${String.fromCharCode(65+question.answer)}. ${question.choices[question.answer]}`);
      appendFullText(answer,question.explanation);item.append(choices,answer);questions.append(item);
    });
    all.append(questions);root.append(all);
  }
  updateTopicStatus();
  const citation=node("p",`Source: ${lesson.sourceLabel}. `,"curriculum-source");
  const source=sourceLink(lesson.sourceUrl,"Open reference");if(source)citation.append(source);
  if(lesson.sourceNote)citation.append(document.createTextNode(` ${lesson.sourceNote}`));
  root.append(citation);
  const nav=node("nav",undefined,"history-lesson-actions");nav.setAttribute("aria-label","Lesson navigation");
  for(const [offset,label] of [[-1,"Previous lesson"],[1,"Next lesson"]]) {
    const target=flat[position+offset];
    if(target) {const link=node("a",label,"button-secondary");link.href=lessonUrl(target);nav.append(link);}
    else {const button=makeButton(label,()=>{});button.disabled=true;nav.append(button);}
  }
  controls.after(nav);
  root.append(nav.cloneNode(true));
  const quiz=node("section",undefined,"history-quiz");quiz.hidden=true;quiz.id="lesson-practice";quiz.setAttribute("aria-live","polite");root.append(quiz);
  let index=0,score=0,answered=false,recorded=false,attemptId=null,busy=false;
  const responses=new Map();
  function saveDraft() {
    store.writePracticeDraft(lesson.id,{version:1,id:attemptId,contentVersion:practiceContentVersion(lesson),index,
      answers:lesson.questions.map((_,i)=>responses.get(i)??null)});
  }
  function guarded(action,requiresDraft=false) {
    return async()=>{
      if(busy)return;busy=true;
      quiz.querySelector(".lesson-practice-error")?.remove();
      try {
        await store.confirmPracticeIdentity();
        if(!root.isConnected)return;
        if(requiresDraft && store.readPracticeDraft(lesson.id)?.id!==attemptId)
          throw new Error("This practice was finished or restarted in another tab. Reopen practice to continue.");
        await action();
      } catch(error) {
        practiceStatus.textContent=error.message;
        const message=node("p",error.message,"lesson-practice-error");message.setAttribute("role","alert");quiz.prepend(message);
      }
      finally {busy=false;}
    };
  }
  function startNew() {
    attemptId=crypto.randomUUID();index=0;score=0;answered=false;recorded=false;responses.clear();
    saveDraft();showQuestion();
  }
  function offerPractice() {
    const draft=store.readPracticeDraft(lesson.id);
    if(draft && validPracticeDraft(draft,lesson)) {
      quiz.replaceChildren(node("h3","Continue saved lesson practice?"),
        node("p",`Question ${draft.index+1} of ${lesson.questions.length} · ${draft.answers.filter(answer=>answer!==null).length} answered. Saved only on this device for your current account or guest profile.`));
      const resume=makeButton("Resume practice",guarded(()=>{
        // Re-read rather than resurrecting a draft completed/restarted in another tab.
        const current=store.readPracticeDraft(lesson.id);
        if(!validPracticeDraft(current,lesson) || current.id!==draft.id){offerPractice();return;}
        attemptId=current.id;index=current.index;recorded=false;responses.clear();
        current.answers.forEach((answer,i)=>{if(answer!==null)responses.set(i,answer);});
        showQuestion();
      }));resume.id="resume-lesson-practice";
      const restart=makeButton("Restart practice",guarded(startNew));restart.id="restart-lesson-practice";
      quiz.append(resume,restart);
    } else {
      if(draft) {
        store.writePracticeDraft(lesson.id,null);
        practiceStatus.textContent="Saved practice expired because its questions changed or its saved answers were incompatible. Start a new practice.";
        quiz.replaceChildren(node("p","The previous practice can no longer be resumed."),makeButton("Start new practice",guarded(startNew)));
      } else startNew();
    }
  }
  function showQuestion() {
    score=[...responses].filter(([questionIndex,answer])=>lesson.questions[questionIndex].answer===answer).length;
    quiz.replaceChildren();
    const back=node("a","Back to lesson content");back.href=requestedTopic===null?"#lesson-page":`#topic-${requestedTopic}`;
    back.addEventListener("click",event=>{event.preventDefault();quiz.hidden=true;(requestedTopic===null?root:document.getElementById(`topic-${requestedTopic}`) || root).scrollIntoView({behavior:"smooth",block:"start"});});
    quiz.append(back);
    if(index>=lesson.questions.length) {
      if(!recorded) {
        store.writePracticeDraft(lesson.id,null,{id:attemptId,lesson:lesson.number || lesson.title,grade:lesson.grade,subject:lesson.subject,score,total:lesson.questions.length,completedAt:new Date().toISOString(),kind:lesson.origin==="ai_authored"?"ai_authored":"published_lesson"});
        recorded=true;changed();
      }
      quiz.append(node("h3",`Practice complete · ${score} / ${lesson.questions.length}`),makeButton("Try again",guarded(startNew)));return;
    }
    const q=lesson.questions[index];answered=responses.has(index);
    quiz.append(node("h3",`Question ${index+1} of ${lesson.questions.length}`),node("p",q.prompt));
    function feedback(choiceIndex) {
      quiz.querySelectorAll(".history-choice").forEach(option=>{option.disabled=true;});
      quiz.append(node("p",`${choiceIndex===q.answer?"Correct.":"Not quite."} Correct answer: ${String.fromCharCode(65+q.answer)}. ${q.choices[q.answer]} ${q.explanation}`,"quiz-feedback"),
        makeButton(index===lesson.questions.length-1?"See score":"Next question",guarded(()=>{
          const previous=index;index++;
          try {if(index<lesson.questions.length)saveDraft();showQuestion();}
          catch(error){index=previous;showQuestion();throw error;}
        },true)));
    }
    q.choices.forEach((choice,choiceIndex)=>{
      const button=makeButton(`${String.fromCharCode(65+choiceIndex)}. ${choice}`,guarded(()=>{
        if(answered)return;answered=true;
        responses.set(index,choiceIndex);
        try {saveDraft();}catch(error){answered=false;responses.delete(index);throw error;}
        button.setAttribute("aria-pressed","true");
        feedback(choiceIndex);
      },true));
      button.className="history-choice";button.setAttribute("aria-pressed",String(responses.get(index)===choiceIndex));quiz.append(button);
    });
    if(answered)feedback(responses.get(index));
  }
}
