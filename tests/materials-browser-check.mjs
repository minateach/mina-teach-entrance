import assert from "node:assert/strict";
import {browserDriver} from "./browser-driver.mjs";
import {materialFixtures} from "./material-fixtures.mjs";
if(!process.env.REPLIT_DEV_DOMAIN)throw new Error("REPLIT_DEV_DOMAIN is required.");
const origin=`https://${process.env.REPLIT_DEV_DOMAIN}`,browser=await browserDriver();
const {evaluate,waitFor,command}=browser;
const get=async path=>{const response=await fetch(origin+path);assert.equal(response.status,200);return response.json();};
const navigate=async(path,condition)=>{await command("Page.navigate",{url:origin+path});await waitFor(condition);};
try {
  await command("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  const audit=await get("/api/learning/audit");
  assert.equal(audit.courses.length,72);
  assert.equal(audit.courses.filter(course=>course.primary).length,36);
  assert.equal(audit.curriculumCompletenessVerified,false);
  const historyAudit=await get("/api/learning/audit?grade=10&subject=History");
  assert.equal(historyAudit.topics.length,19);
  assert.ok(historyAudit.topics.every(topic=>topic.noteCharacters>80));
  assert.ok(historyAudit.topics.every(topic=>!topic.missing.some(gap=>gap.includes("answers"))));
  let auditedTopics=0;
  const checkedLessons=new Map();
  for(const course of audit.courses.filter(course=>course.lessons>0)) {
    let offset=0,courseTopics=0;
    do {
      const page=await get(`/api/learning/audit?${new URLSearchParams({grade:course.grade,subject:course.subject,language:"en",offset})}`);
      courseTopics+=page.topics.length;
      for(const topic of page.topics) {
        let lesson=checkedLessons.get(topic.lessonId);
        if(!lesson) {
          ({lesson}=await get(`/api/learning/content/${topic.lessonId}`));
          checkedLessons.set(topic.lessonId,lesson);
          const recovered=[];
          if(lesson.materialOutline?.length) {
            let materialOffset=0;
            do {
              const materialPage=await get(`/api/learning/content/${lesson.id}/materials?offset=${materialOffset}&limit=10`);
              recovered.push(...materialPage.materials);materialOffset=materialPage.nextOffset;
            }while(materialOffset!==null);
          }
          assert.deepEqual(recovered.map(material=>material.id),(lesson.materialOutline || []).map(material=>material.id));
        }
        assert.equal(lesson.grade,course.grade);assert.equal(lesson.subject,course.subject);
        const original=lesson.topics?.length?lesson.topics[Number(topic.id)]?.notes:topic.id==="0"?lesson.content:"";
        const text=Array.isArray(original)?original.join("\n"):original || "";
        assert.equal(topic.noteCharacters,text.length);
        assert.equal(topic.curriculumCompletenessVerified,false);
      }
      offset=page.nextOffset;
    }while(offset!==null);
    assert.equal(courseTopics,course.topics);
    auditedTopics+=courseTopics;
  }
  console.log(`PASS: audited every currently registered English-content topic: ${auditedTopics} topics across ${checkedLessons.size} accessible lessons. This excludes unimported textbook material.`);
  await navigate("/learning/coverage.html",'document.querySelectorAll("#audit-courses tr").length===72');
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
  await evaluate('[...document.querySelectorAll("#audit-courses tr")].find(row=>row.children[0].textContent==="10"&&row.children[1].textContent==="History").querySelector("button").click()');
  await waitFor('document.querySelectorAll("#topic-audit article").length===19');
  assert.match(await evaluate('document.getElementById("topic-audit").textContent'),/Full source-by-source topic completeness/);

  const materials=materialFixtures();
  const outline=materials.map(({id,topicId,topicTitle,type,title})=>({id,topicId,topicTitle,type,title}));
  const fixture={id:"db-900002",key:"lesson:900002",grade:9,subject:"English",language:"en",stream:"common",chapter:"Technical browser test",chapterId:"technical-chapter",
    title:"Unpublished browser-only technical fixture",origin:"reviewed",introduction:"INTRODUCTION-MUST-REMAIN-VISIBLE. This is a browser-only technical fixture, not educational content.",
    content:"Complete detailed notes retained exactly. ".repeat(1000)+"FINAL-FULL-NOTES-MARKER",
    sourceLabel:"Technical fixture, not a published textbook",examples:["Worked example must remain accessible."],keyPoints:["All information must remain accessible."],materialOutline:outline,
    topicKeys:["lesson:900002:topic:0","lesson:900002:topic:technical-test"],practiceQuestionCount:1};
  const catalog=await get("/api/learning/catalog?grade=9");
  Object.assign(catalog.subjects.find(subject=>subject.name==="English"),{lessonCount:1,chapterCount:1,availableKeys:[fixture.key],availableTopicKeys:fixture.topicKeys,startLessonId:fixture.id,practiceLessonId:fixture.id,practiceQuestionCount:1});
  let failOnce=1;
  await browser.intercept(request=>{
    const url=new URL(request.url);
    if(url.pathname==="/api/learning/catalog" && url.searchParams.get("grade")==="9")return {body:catalog};
    if(url.pathname==="/api/learning/course" && url.searchParams.get("subject")==="English")return {body:{grade:9,subject:"English",language:"en",lessonCount:1,chapters:[{id:fixture.chapterId,number:1,title:fixture.chapter,lessons:[fixture]}]}};
    if(url.pathname===`/api/learning/content/${fixture.id}`)return {body:{lesson:fixture}};
    if(url.pathname===`/api/learning/content/${fixture.id}/materials`) {
      const offset=Number(url.searchParams.get("offset") || 0);
      if(offset===failOnce){failOnce=-1;return {status:503,body:{error:{message:"Technical test: section temporarily unavailable"}}};}
      return {body:{materials:materials.slice(offset,offset+1),total:materials.length,offset,nextOffset:offset+1<materials.length?offset+1:null}};
    }
    return null;
  });
  await navigate("/learning/?grade=9&subject=English&lesson=db-900002&language=en",'document.querySelector("#topic-materials [role=status]")?.textContent.startsWith("Material 1 of 14")');
  assert.match(await evaluate('document.getElementById("lesson-page").textContent'),/INTRODUCTION-MUST-REMAIN-VISIBLE/);
  const captured=await evaluate(`(()=>{
    const root=document.getElementById("topic-0"),next=root.querySelector("[data-part-action=next]");let text="";
    do{text+=root.querySelector(".lesson-prose").textContent;if(!next || next.disabled)break;next.click();}while(true);return text;
  })()`);
  assert.equal(captured,fixture.content,"no long notes or final characters were dropped");
  assert.equal(await evaluate('document.getElementById("complete-lesson").disabled'),true);
  const capturedMaterial=await evaluate(`(()=>{
    const root=document.querySelector(".material-content"),next=root.querySelector("[data-part-action=next]");let text="";
    do{text+=root.querySelector(".lesson-prose").textContent;if(!next || next.disabled)break;next.click();}while(true);return text;
  })()`);
  assert.equal(capturedMaterial,materials[0].text);
  for(let index=1;index<materials.length;index++) {
    await evaluate('document.querySelector("[data-material-action=next]").click()');
    if(index===1) {
      await waitFor('document.querySelector("#topic-materials [role=status]").textContent.includes("temporarily unavailable")');
      assert.equal(await evaluate('document.getElementById("complete-lesson").disabled'),true);
      await evaluate('[...document.querySelectorAll("#topic-materials button")].find(button=>button.textContent==="Retry material").click()');
    }
    await waitFor(`document.querySelector("#topic-materials [role=status]").textContent.startsWith("Material ${index+1} of 14")`);
    assert.equal(await evaluate('document.querySelector(".material-content>h3").textContent'),materials[index].title);
    if(materials[index].type==="table")assert.match(await evaluate('document.querySelector(".material-content table").textContent'),/ALSO-PRESERVED/);
    if(materials[index].type==="diagram")assert.equal(await evaluate('document.querySelector(".material-diagram").naturalWidth>0'),true);
    if(materials[index].type==="mcq") {
      assert.equal(await evaluate('document.querySelectorAll(".material-content ol li").length'),4);
      await evaluate('document.querySelector(".material-content details summary").click()');
      assert.match(await evaluate('document.querySelector(".material-content").innerText'),/Every stored material section must be accessible/);
    }
    assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
  }
  assert.match(await evaluate('document.querySelector(".material-content").textContent'),/END-OF-TIMELINE/);
  await evaluate('document.querySelector("[data-material-action=previous]").click()');
  await waitFor('document.querySelector("#topic-materials [role=status]").textContent.startsWith("Material 13 of 14")');
  await evaluate('document.querySelector("[data-material-action=next]").click()');
  await waitFor('document.querySelector("#topic-materials [role=status]").textContent.startsWith("Material 14 of 14")');
  assert.equal(await evaluate('document.getElementById("complete-lesson").disabled'),false);
  await evaluate('document.getElementById("complete-lesson").click()');
  assert.match(await evaluate('document.getElementById("lesson-topic-progress").textContent'),/2 of 2/);
  await evaluate('document.getElementById("start-practice").click()');
  await waitFor('document.querySelectorAll("#lesson-practice .history-choice").length===4');
  await evaluate('document.querySelectorAll("#lesson-practice .history-choice")[1].click()');
  await waitFor('document.querySelector("#lesson-practice .quiz-feedback")');
  await command("Page.reload");
  await waitFor('document.getElementById("start-practice")');
  await evaluate('document.getElementById("start-practice").click()');
  await waitFor('document.getElementById("resume-lesson-practice")');
  await evaluate('document.getElementById("resume-lesson-practice").click()');
  await waitFor('document.querySelector("#lesson-practice .quiz-feedback")');
  await evaluate('document.querySelector("#lesson-practice button:not(.history-choice)").click()');
  await waitFor('document.getElementById("lesson-practice").textContent.includes("Practice complete")');
  assert.match(await evaluate('document.getElementById("lesson-practice").textContent'),/1 \/ 1/);
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("minaTeach.learning.v1")).practice[0].kind'),"published_lesson");
  assert.match(await evaluate("location.search"),/material=timeline/);
  const reopened=await evaluate("location.pathname+location.search");
  await navigate(reopened,'document.querySelector("#topic-materials [role=status]")?.textContent.startsWith("Material 14 of 14")');
  for(const path of ["/api/learning/lessons/manage/1","/api/learning/lessons/1/materials"]) {
    const status=await evaluate(`fetch(${JSON.stringify(path)},${path.endsWith("materials")?'{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}':'{}'}).then(response=>response.status)`);
    assert.equal(status,401);
  }
  assert.deepEqual(browser.exceptions,[]);
  console.log("PASS: real coverage audit for all 72 catalog grade/subject combinations and 19 available topics; full long notes plus introduction; all 14 material renderers; numbered text and material Previous/Next; retry without false completion; diagrams/tables/MCQ answers; published-lesson practice; reload position; phone layout; protected material authoring endpoints.");
  console.log("SCOPE: rich published-material rendering used browser-only API fixtures. Real PostgreSQL storage/pagination is tested separately with rolled-back rows. Real signed-in authoring and complete textbook ingestion are not verified.");
}finally{await browser.close();}
