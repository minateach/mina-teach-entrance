import {api} from "./learning-state.js";
const $=id=>document.getElementById(id);
const element=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
let language="en",loading=false;
async function inspect(course,offset=0) {
  const root=$("topic-audit");
  if(offset===0)root.replaceChildren(element("h2",`Grade ${course.grade} · ${course.subject}`));
  const status=element("p","Inspecting available topic materials…");status.setAttribute("role","status");root.append(status);root.scrollIntoView({behavior:"smooth",block:"start"});
  try {
    const audit=await api(`/api/learning/audit?${new URLSearchParams({grade:course.grade,subject:course.subject,language,offset})}`);
    for(const topic of audit.topics) {
      const article=element("article");article.className="history-lesson-section";
      article.append(element("h3",`${topic.lessonTitle} · ${topic.title}`));
      article.append(element("p",`${topic.noteCharacters.toLocaleString()} note characters; ${topic.definitions} definitions; ${topic.exampleProvided?"example supplied":"no legacy example recorded"}; ${topic.materialSections.length} additional material sections.`));
      article.append(element("p",`Shared lesson material: ${topic.sharedLessonMcqs} MCQs, ${topic.sharedExercises} exercises, ${topic.sharedRevisionQuestions} revision questions. These counts are shared, not distinct per-topic questions.`));
      if(topic.materialSections.length) {
        const list=element("ul");
        topic.materialSections.forEach(material=>list.append(element("li",`${material.type}: ${material.title} · ${material.id}`)));article.append(list);
      }
      for(const gap of topic.missing)article.append(element("p",`Missing: ${gap}.`));
      article.append(element("p","Full source-by-source topic completeness and the relevance of absent material types have not been verified."));
      const link=element("a","Open actual lesson material");link.href=`/learning/?${new URLSearchParams({grade:topic.grade,subject:topic.subject,language:topic.language,lesson:topic.lessonId,topic:topic.id})}`;article.append(link);
      article.append(element("p",`Recorded source: ${topic.sourceLabel || "No source recorded"}`));root.append(article);
    }
    if(audit.nextOffset!==null){const more=element("button","Inspect next topic batch");more.onclick=()=>{more.remove();inspect(course,audit.nextOffset);};root.append(more);}
    status.textContent=`Inspected ${audit.topics.length} available topics in this batch. Curriculum completeness remains unverified.`;
  }catch(error){status.textContent=error.message;const retry=element("button","Retry topic audit");retry.onclick=()=>{retry.remove();status.remove();inspect(course,offset);};root.append(retry);}
}
async function load() {
  if(loading)return;loading=true;
  language=$("audit-language").value;$("audit-refresh").disabled=true;
  $("audit-status").textContent="Checking all grade and subject records…";$("audit-courses").replaceChildren();
  try {
    const audit=await api(`/api/learning/audit?${new URLSearchParams({language})}`);
    $("audit-limitations").replaceChildren(...audit.limitations.map(text=>element("li",text)));
    const primary=audit.courses.filter(course=>course.primary),populated=primary.filter(course=>course.lessons>0).length;
    $("audit-status").textContent=`${audit.courses.length} grade/subject combinations checked. ${populated} of ${primary.length} primary combinations have available lessons. None is certified as complete textbook coverage.`;
    for(const course of audit.courses) {
      const row=element("tr");
      [course.grade,course.subject,course.lessons,course.topics,course.drafts,course.sourceCoverage].forEach(value=>row.append(element("td",value)));
      const action=element("td");
      if(course.lessons){const open=element("button","Inspect topics");open.onclick=()=>inspect(course);action.append(open);}
      else action.append(element("span","No published learning content"));
      row.append(action);$("audit-courses").append(row);
    }
  }catch(error){$("audit-status").textContent=error.message;}
  finally{loading=false;$("audit-refresh").disabled=false;}
}
$("audit-refresh").onclick=load;$("audit-language").onchange=()=>{$("topic-audit").replaceChildren(element("h2","Select a populated subject to inspect its topic materials"));load();};
load();
