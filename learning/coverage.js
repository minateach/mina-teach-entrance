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
      article.append(element("p",`Topic-specific materials: ${topic.topicMcqs || 0} MCQs, ${topic.topicExercises || 0} exercises, ${topic.topicRevisionQuestions || 0} revision questions. Shared lesson material: ${topic.sharedLessonMcqs} MCQs, ${topic.sharedExercises} exercises, ${topic.sharedRevisionQuestions} revision questions.`));
      if(topic.materialSections.length) {
        const list=element("ul");
        topic.materialSections.forEach(material=>{
          const provenance=[material.sourceTitle,material.sourceLabel,material.sourcePages,material.sourceAuthor,material.sourcePublisher,material.sourceFile].filter(Boolean).join(" · ");
          list.append(element("li",`${material.type}: ${material.title} · ${material.id}${provenance?` · Source: ${provenance}`:""}`));
        });article.append(list);
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
function inspectSource(course) {
  const root=$("topic-audit"),mapping=course.curriculumSource;
  root.replaceChildren(element("h2",`Grade ${course.grade} · ${course.subject} · Source map`));
  root.append(element("p",mapping.statusLabel,"notice"));
  root.append(element("p",mapping.note));
  if(mapping.source) {
    const source=mapping.source;
    root.append(element("h3",source.title));
    const metadata=[source.publisher,source.authors?.length?`Authors: ${source.authors.join(", ")}`:null,
      source.publicationDate?`Publication: ${source.publicationDate}`:null,
      source.pageCount?`${source.pageCount} PDF pages`:null].filter(Boolean);
    if(metadata.length)root.append(element("p",metadata.join(" · ")));
    if(source.file)root.append(element("p",`Uploaded reference: ${source.file.split("/").at(-1)}`));
    if(source.url) {
      const link=element("a","Open recorded source");
      link.href=source.url;link.target="_blank";link.rel="noopener noreferrer";root.append(link);
    }
  } else {
    root.append(element("p","No grade-specific textbook or syllabus source is registered."));
  }
  if(mapping.units.length) {
    root.append(element("h3",`Recorded textbook outline · ${mapping.units.length} units`));
    const list=element("ol");
    for(const unit of mapping.units) {
      const item=element("li",`${unit.number}. ${unit.title}${unit.pages?` · pp. ${unit.pages}`:unit.pageStart?` · starts p. ${unit.pageStart}`:""}`);
      if(unit.sections?.length) {
        const sections=element("ul");
        unit.sections.forEach(section=>sections.append(element("li",section)));
        item.append(sections);
      }
      list.append(item);
    }
    root.append(list);
  } else {
    root.append(element("p","No chapter or topic outline is mapped for this subject and grade."));
  }
  root.append(element("p",mapping.lessonLanguageNote));
  root.append(element("p",`Student lesson records in ${language} · ${course.lessons} published · ${course.drafts} drafts · ${course.topics} topics. This course is not certified complete.`));
  if(course.lessons) {
    const button=element("button","Inspect available lesson materials");
    button.onclick=()=>inspect(course);root.append(button);
  } else {
    root.append(element("p","No published learning content is available for this selected language."));
  }
}
async function load() {
  if(loading)return;loading=true;
  language=$("audit-language").value;$("audit-refresh").disabled=true;
  $("audit-status").textContent="Checking all grade and subject records…";$("audit-courses").replaceChildren();
  try {
    const audit=await api(`/api/learning/audit?${new URLSearchParams({language})}`);
    $("audit-limitations").replaceChildren(...audit.limitations.map(text=>element("li",text)));
    const primary=audit.courses.filter(course=>course.primary),populated=primary.filter(course=>course.lessons>0).length;
    const sourced=primary.filter(course=>course.curriculumSource?.source).length;
    $("audit-status").textContent=`${primary.length} requested subject-grade combinations checked. ${populated} have published lessons in ${language}; ${sourced} have a traceable source record, including partial references and a teacher guide. None is certified as complete textbook coverage.`;
    for(const course of primary) {
      const row=element("tr");
      const labels=["Grade","Subject","Available lessons","Topics","Draft lessons","Source coverage","Units outlined"];
      [course.grade,course.subject,course.lessons,course.topics,course.drafts,course.sourceCoverage,course.curriculumSource.units.length].forEach((value,index)=>{
        const cell=element("td",value);cell.dataset.label=labels[index];row.append(cell);
      });
      const action=element("td");
      action.dataset.label="Inspect";
      const sourceButton=element("button","View source map");sourceButton.onclick=()=>inspectSource(course);action.append(sourceButton);
      if(course.lessons){const open=element("button","Inspect topics");open.onclick=()=>inspect(course);action.append(open);}
      else action.append(element("span","No published learning content"));
      row.append(action);$("audit-courses").append(row);
    }
  }catch(error){$("audit-status").textContent=error.message;}
  finally{loading=false;$("audit-refresh").disabled=false;}
}
$("audit-refresh").onclick=load;$("audit-language").onchange=()=>{$("topic-audit").replaceChildren(element("h2","Select a subject to inspect source mapping and available lesson materials"));load();};
load();
