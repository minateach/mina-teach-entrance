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
export function sourceLink(url,text) {
  try { const parsed=new URL(url); if(!["https:","http:"].includes(parsed.protocol)) return null; }
  catch {return null;}
  const a=node("a",text);a.href=url;a.target="_blank";a.rel="noopener noreferrer";return a;
}
export function renderLesson({root,lesson,course,store,changed}) {
  root.replaceChildren();
  const flat=course.chapters.flatMap(chapter=>chapter.lessons);
  const position=flat.findIndex(item=>item.id===lesson.id);
  const title=node("h2",`${lesson.number?`${lesson.number} · `:""}${lesson.title}`);
  root.append(title,node("p",lesson.origin==="ai_authored"?"Original AI-authored learning material and practice. Independent educator review is pending; not an official examination paper.":"Educator-published learning material. Recorded sources are shown below.","notice"));
  const item={key:lesson.key,id:lesson.id,grade:lesson.grade,subject:lesson.subject,stream:lesson.stream,language:lesson.language,title:lesson.title};
  const makeButton=(text,callback)=>{const button=node("button",text);button.type="button";button.addEventListener("click",callback);return button;};
  const controls=node("div",undefined,"history-lesson-actions");
  const save=makeButton(store.state.saved.some(entry=>entry.key===lesson.key)?"★ Saved lesson":"☆ Save lesson",()=>{
    const saved=store.toggle("saved",item);save.textContent=saved?"★ Saved lesson":"☆ Save lesson";changed();
  });
  const complete=makeButton(store.state.completed.includes(lesson.key)?"Completed ✓":"Mark complete",()=>{
    if(!store.state.completed.includes(lesson.key))store.state.completed.push(lesson.key);
    store.save();complete.textContent="Completed ✓";changed();
  });
  complete.id="complete-lesson";
  // This view is only built after successful detail loading; titles/failed requests cannot be completed.
  complete.disabled=typeof lesson.content!=="string" || lesson.content.trim().length<80;
  const practice=makeButton("Start practice",()=>{quiz.hidden=false;showQuestion();quiz.scrollIntoView({behavior:"smooth",block:"start"});});
  practice.id="start-practice";
  controls.append(save,complete);
  if(lesson.questions?.length) controls.append(practice);
  else {
    const link=node("a","Start practice","button-secondary");
    link.href=`/exams/?${new URLSearchParams({grade:String(lesson.grade),stream:lesson.stream==="social"?"social":"natural",subject:lesson.subject,topic:lesson.chapter})}`;
    link.id="start-practice";controls.append(link);
  }
  root.append(controls,node("p","Completion records that you studied the content; it is not an official assessment.","muted"));
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
        else li.textContent=text;
        list.append(li);
      });block.append(list);
    } else block.append(node("p",value,"lesson-prose"));
    root.append(block);return block;
  }
  const introduction=section(lesson.introduction?"Introduction":"Lesson notes",lesson.introduction || lesson.content,"topic-0");
  section("Learning objectives",lesson.objectives);
  const topics=lesson.topics?.length?lesson.topics:[{title:lesson.title,block:introduction}];
  topics.forEach((topic,index)=>{
    if(lesson.topics?.length)introduction.removeAttribute("id");
    const block=topic.block || section(topic.title,topic.notes,`topic-${index}`);
    const bookmarkKey=`${lesson.key}:topic:${index}`;
    const bookmark=makeButton(store.state.bookmarks.some(entry=>entry.key===bookmarkKey)?"★ Topic bookmarked":"Bookmark topic",()=>{
      const active=store.toggle("bookmarks",{...item,key:bookmarkKey,topicIndex:index,title:`${lesson.title} · ${topic.title}`});
      bookmark.textContent=active?"★ Topic bookmarked":"Bookmark topic";changed();
    });
    block.append(bookmark);
    section("Important definitions",topic.terms);
    section("Example",topic.example);
  });
  section("Examples and worked solutions",lesson.examples);
  section("Important notes",lesson.keyPoints);
  section("Exercises",lesson.exercises);
  section("Lesson summary",lesson.summary);
  section("Revision questions",lesson.revision);
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
  let index=0,score=0,answered=false,recorded=false;
  function showQuestion() {
    quiz.replaceChildren();
    if(index>=lesson.questions.length) {
      if(!recorded) {
        recorded=true;
        store.state.practice.unshift({id:crypto.randomUUID(),lesson:lesson.number || lesson.title,grade:lesson.grade,subject:lesson.subject,score,total:lesson.questions.length,completedAt:new Date().toISOString(),kind:"ai_authored"});
        store.state.practice=store.state.practice.slice(0,50);store.save();changed();
      }
      quiz.append(node("h3",`Practice complete · ${score} / ${lesson.questions.length}`),makeButton("Try again",()=>{
        index=0;score=0;answered=false;recorded=false;showQuestion();
      }));return;
    }
    const q=lesson.questions[index];answered=false;
    quiz.append(node("h3",`Question ${index+1} of ${lesson.questions.length}`),node("p",q.prompt));
    q.choices.forEach((choice,choiceIndex)=>{
      const button=makeButton(`${String.fromCharCode(65+choiceIndex)}. ${choice}`,()=>{
        if(answered)return;answered=true;
        if(choiceIndex===q.answer)score++;
        quiz.querySelectorAll(".history-choice").forEach(option=>{option.disabled=true;});
        quiz.append(node("p",`${choiceIndex===q.answer?"Correct.":"Not quite."} Correct answer: ${String.fromCharCode(65+q.answer)}. ${q.choices[q.answer]} ${q.explanation}`,"quiz-feedback"),
          makeButton(index===lesson.questions.length-1?"See score":"Next question",()=>{index++;showQuestion();}));
      });
      button.className="history-choice";quiz.append(button);
    });
  }
}
