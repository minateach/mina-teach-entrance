import assert from "node:assert/strict";
import {browserDriver} from "./browser-driver.mjs";
import {checkLessonPracticeRecovery} from "./lesson-practice-browser.mjs";
if(!process.env.REPLIT_DEV_DOMAIN)throw new Error("REPLIT_DEV_DOMAIN is required.");
const origin=`https://${process.env.REPLIT_DEV_DOMAIN}`;
const browser=await browserDriver();
const {evaluate,waitFor,command}=browser;
const json=async path=>{
  const response=await fetch(`${origin}${path}`);
  const data=await response.json();return {status:response.status,data};
};
async function navigate(path,condition='document.getElementById("coverage-status")?.textContent.includes("available lessons")') {
  await command("Page.navigate",{url:`${origin}${path}`});
  await waitFor(`location.href===${JSON.stringify(origin+path)} && document.readyState==="complete" && (${condition})`);
}
const course="/learning/?grade=10&subject=History&language=en";
try {
  await command("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate("/",'document.querySelectorAll("a.card").length >= 10');
  assert.equal(await evaluate('document.querySelector(".hero .btn").getAttribute("href")'),"/learning/");
  await evaluate('document.querySelector(".hero .btn").click()');
  await waitFor('location.pathname==="/learning/" && document.querySelectorAll(".course-card").length===17');
  assert.equal(await evaluate('document.querySelector(".knowledge-promo a")?.getAttribute("href")'),"/learning/knowledge/");
  await navigate("/learning/?grade=10&language=en");
  await evaluate('localStorage.setItem("minaTeach.learning.v1",JSON.stringify({completed:["9:natural:Mathematics:0","nonexistent"],tasks:[{text:"Preserve my planner task",done:false}]}))');
  await navigate("/learning/?grade=10&language=en");
  assert.equal(await evaluate('document.getElementById("completed-count").textContent'),"0");
  assert.match(await evaluate('document.getElementById("task-list").textContent'),/Preserve my planner task/);
  await evaluate('document.getElementById("task-input").value="Temporary planner check";document.getElementById("task-form").requestSubmit()');
  assert.equal(await evaluate('document.getElementById("task-count").textContent'),"2");
  await evaluate('document.querySelectorAll("#task-list input")[1].click()');
  assert.equal(await evaluate('document.getElementById("task-count").textContent'),"1");
  await evaluate('document.querySelectorAll("#task-list button")[1].click()');
  assert.doesNotMatch(await evaluate('document.getElementById("task-list").textContent'),/Temporary planner check/);
  assert.equal(await evaluate('document.querySelectorAll(".course-card").length'),17);
  assert.equal(browser.requests.some(url=>url.endsWith("/learning/history-grade10.js")),false,"no entire bundled curriculum script downloaded");
  assert.equal(browser.requests.some(url=>url.includes("/api/learning/content/")),false,"dashboard loads summaries only");
  const inlinePractice=await evaluate('[...document.querySelectorAll(".course-card")].find(card=>card.querySelector(".subject-card").getAttribute("aria-label").includes("History")).querySelector(".subject-practice").getAttribute("href")');
  assert.match(inlinePractice,/practice=1/);
  assert.doesNotMatch(inlinePractice,/\/exams\//);
  await navigate(inlinePractice,'document.getElementById("lesson-practice")?.hidden===false');
  assert.match(await evaluate('document.getElementById("lesson-practice").textContent'),/Question 1 of 10/);
  await navigate("/learning/?grade=10&language=en");
  await evaluate('document.getElementById("grade").value="11";document.getElementById("grade").dispatchEvent(new Event("change"))');
  await waitFor('document.getElementById("coverage-status").textContent.includes("Grade 11")');
  await evaluate('[...document.querySelectorAll(".subject-card")].find(a=>a.getAttribute("aria-label").includes("Mathematics")).click()');
  await waitFor('document.querySelector("#subjects h2")?.textContent.includes("Mathematics")');
  assert.match(await evaluate('document.getElementById("subjects").textContent'),/Grade 11/);
  for(const grade of [9,10,11,12]) {
    for(const subject of ["Mathematics","Physics","Chemistry","Biology","English","Geography","History","Economics","Civics"]) {
      const params=new URLSearchParams({grade:String(grade),subject,language:"en"});
      const response=await json(`/api/learning/course?${params}`);
      assert.equal(response.status,200);
      assert.equal(response.data.grade,grade);
      await navigate(`/learning/?${params}`,'document.querySelector("#subjects h2")?.textContent.includes("Chapters and lessons")');
      const text=await evaluate('document.getElementById("subjects").innerText');
      assert.doesNotMatch(text,/study prompt|no reviewed lesson source/i);
      if(!response.data.lessonCount) {
        assert.match(text,/No learning content is published/);
        assert.equal(await evaluate('document.querySelector("#complete-lesson")!==null'),false);
      }
      assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true,`${grade} ${subject} fits mobile`);
    }
  }
  await navigate(course,'document.querySelector(".history-lesson-link")');
  assert.equal(await evaluate('document.querySelectorAll(".history-lesson-link").length'),6);
  const chapterHref=await evaluate('document.querySelector(".history-unit-card>a").getAttribute("href")');
  await navigate(chapterHref,'document.querySelector(".history-lesson-link")');
  await evaluate('document.querySelector(".history-lesson-link").click()');
  await waitFor('document.getElementById("lesson-page")?.innerText.includes("Features of Capitalism")');
  const firstLessonUrl=await evaluate("location.pathname+location.search");
  assert.equal(await evaluate('document.getElementById("complete-lesson").disabled'),false);
  assert.match(await evaluate('document.getElementById("lesson-topic-progress").textContent'),/0 of 4/);
  await evaluate('document.querySelector("[data-topic-action=complete]").click()');
  assert.match(await evaluate('document.getElementById("lesson-topic-progress").textContent'),/1 of 4/);
  assert.equal(await evaluate('document.getElementById("completed-count").textContent'),"0","studying one topic does not complete the whole lesson");
  await navigate(firstLessonUrl,'document.getElementById("lesson-page")');
  assert.match(await evaluate('document.getElementById("lesson-topic-progress").textContent'),/1 of 4/);
  await evaluate('document.querySelector(".lesson-page .history-lesson-actions button").click()');
  await evaluate('document.getElementById("complete-lesson").click()');
  await evaluate('[...document.querySelectorAll(".history-lesson-section button")].find(button=>button.textContent==="Bookmark topic").click()');
  assert.equal(await evaluate('document.getElementById("completed-count").textContent'),"1","legacy fake completions excluded");
  assert.match(await evaluate('document.getElementById("lesson-topic-progress").textContent'),/4 of 4/);
  await navigate(firstLessonUrl,'document.getElementById("lesson-page")');
  assert.equal(await evaluate('document.getElementById("complete-lesson").textContent'),"Completed ✓");
  assert.equal(await evaluate('document.querySelector(".lesson-page .history-lesson-actions button").textContent'),"★ Saved lesson");
  assert.equal(await evaluate('document.querySelector(".history-lesson-section button").textContent'),"★ Topic bookmarked");

  const courseData=(await json("/api/learning/course?grade=10&subject=History")).data;
  assert.ok(JSON.stringify(courseData).length<8000);
  const lessons=courseData.chapters.flatMap(chapter=>chapter.lessons);
  await checkLessonPracticeRecovery({browser,navigate,json,lessons,course});
  for(const meta of lessons) {
    const detail=(await json(`/api/learning/content/${meta.id}`)).data.lesson;
    assert.equal(detail.questions.length,10);
    const path=`/learning/?${new URLSearchParams({grade:"10",subject:"History",language:"en",lesson:meta.id})}`;
    await navigate(path,'document.getElementById("lesson-page")');
    const nav=await evaluate('document.querySelector(".lesson-page nav").innerText');
    assert.match(nav,/Previous lesson/);assert.match(nav,/Next lesson/);
    if(meta===lessons[0])assert.equal(await evaluate('document.querySelector(".lesson-page nav button").disabled'),true);
    await evaluate('document.getElementById("start-practice").click()');
    await waitFor('!document.getElementById("lesson-practice").hidden && document.querySelector(".history-choice, #restart-lesson-practice")');
    if(await evaluate('!!document.getElementById("restart-lesson-practice")')) {
      await evaluate('document.getElementById("restart-lesson-practice").click()');
      await waitFor('document.querySelector(".history-choice")');
    }
    for(const [index,question] of detail.questions.entries()) {
      await evaluate(`document.querySelectorAll(".history-choice")[${question.answer}].click()`);
      await waitFor('document.querySelector(".quiz-feedback")');
      assert.match(await evaluate('document.querySelector(".quiz-feedback").textContent'),/Correct answer:/);
      await evaluate('document.getElementById("lesson-practice").lastElementChild.click()');
      await waitFor(index===detail.questions.length-1?'document.getElementById("lesson-practice").textContent.includes("Practice complete")':`document.querySelector("#lesson-practice h3")?.textContent==="Question ${index+2} of ${detail.questions.length}"`);
    }
    assert.match(await evaluate('document.getElementById("lesson-practice").textContent'),/10 \/ 10/);
  }
  await evaluate('document.querySelector(".history-quiz button").click()');
  await waitFor('document.querySelector(".history-choice")');
  const last=(await json(`/api/learning/content/${lessons.at(-1).id}`)).data.lesson;
  for(const [index,q] of last.questions.entries()) {
    await evaluate(`document.querySelectorAll(".history-choice")[${index===0?(q.answer+1)%4:q.answer}].click()`);
    await waitFor('document.querySelector(".quiz-feedback")');
    if(index===0)assert.match(await evaluate('document.querySelector(".quiz-feedback").textContent'),/Not quite/);
    await evaluate('document.getElementById("lesson-practice").lastElementChild.click()');
    await waitFor(index===last.questions.length-1?'document.getElementById("lesson-practice").textContent.includes("Practice complete")':`document.querySelector("#lesson-practice h3")?.textContent==="Question ${index+2} of ${last.questions.length}"`);
  }
  assert.match(await evaluate('document.getElementById("lesson-practice").textContent'),/9 \/ 10/);
  const previousHref=await evaluate('document.querySelector(".lesson-page nav a").getAttribute("href")');
  await navigate(previousHref,'document.getElementById("lesson-page")');
  assert.match(await evaluate('document.querySelector(".lesson-page h2").textContent'),/American Civil War/);
  const nextHref=await evaluate('[...document.querySelectorAll(".lesson-page nav a")].find(a=>a.textContent==="Next lesson").getAttribute("href")');
  await navigate(nextHref,'document.getElementById("lesson-page")');
  assert.match(await evaluate('document.querySelector(".lesson-page h2").textContent'),/Eastern Question/);
  await navigate("/learning/?grade=10&language=en");
  assert.equal(await evaluate('document.getElementById("completed-count").textContent'),"1");
  assert.equal(await evaluate('document.getElementById("remaining-count").textContent'),"5");
  assert.match(await evaluate('document.getElementById("topic-coverage-status").textContent'),/4 of 19 available topics studied/);
  assert.match(await evaluate('document.getElementById("quiz-progress").textContent'),/AI-authored practice/);
  assert.match(await evaluate('document.getElementById("weekly-summary").innerText'),/Grade 10[\s\S]*History[\s\S]*1/);
  assert.match(await evaluate('document.getElementById("monthly-summary").innerText'),/History/);
  assert.match(await evaluate('document.getElementById("achievement-list").innerText'),/First lesson[\s\S]*Earned/);
  await evaluate('document.querySelector("#saved-lessons button").click()');
  await waitFor('document.getElementById("lesson-page")?.innerText.includes("Features of Capitalism")');
  await navigate("/learning/?grade=10&language=en");
  await evaluate('document.querySelector("#bookmarked-topics button").click()');
  await waitFor('document.getElementById("topic-0") && new URLSearchParams(location.search).get("topic")==="0"');
  await navigate("/learning/?grade=10&language=en");
  await evaluate('document.querySelectorAll("#saved-lessons button")[1].click()');
  await evaluate('document.querySelectorAll("#bookmarked-topics button")[1].click()');
  await navigate("/learning/?grade=10&language=en");
  assert.match(await evaluate('document.getElementById("saved-lessons").textContent'),/No saved lessons/);
  assert.match(await evaluate('document.getElementById("bookmarked-topics").textContent'),/No bookmarked topics/);
  await navigate("/learning/?grade=9&language=en");
  const english=(await json("/api/learning/catalog?grade=9")).data.subjects.find(subject=>subject.name==="English");
  assert.ok(english.reviewedQuestionCount>=10);
  const reviewedHref=await evaluate('[...document.querySelectorAll(".course-card")].find(card=>card.querySelector(".subject-card").getAttribute("aria-label").includes("English")).querySelector(".subject-practice").getAttribute("href")');
  await navigate(reviewedHref,`document.getElementById("bank-status")?.textContent.includes("${english.reviewedQuestionCount} reviewed questions available")`);
  assert.equal(await evaluate('document.getElementById("subject").value'),"English");
  assert.equal(await evaluate('document.getElementById("start-exam").disabled'),false);
  await evaluate('document.getElementById("start-exam").click()');
  await waitFor('document.getElementById("bank-status").textContent.includes("Sign in before starting an exam")');

  for(const path of ["/learning/?grade=13","/learning/?grade=10&subject=Unknown","/learning/?grade=10&subject=History&lesson=db-99999","/learning/?grade=9&subject=History&lesson=history10-1.1","/learning/?grade=10&subject=History&chapter=wrong","/learning/?grade=10&language=zz"]) {
    await navigate(path,'document.querySelector("#subjects h2")?.textContent==="Learning content could not be opened"');
    assert.equal(await evaluate('!!document.getElementById("complete-lesson")'),false);
  }
  for(const [path,method] of [["/api/account/data","GET"],["/api/account/data/learning","PUT"],["/api/learning/lessons/manage","GET"],["/api/learning/lessons","POST"],["/api/learning/lessons/1/review","POST"],["/api/exams/history","GET"]]) {
    const status=await evaluate(`fetch(${JSON.stringify(path)},{method:${JSON.stringify(method)},headers:{"Content-Type":"application/json"},${method==="GET"?"":'body:"{}",'}}).then(response=>response.status)`);
    assert.equal(status,401,`${method} ${path} is protected`);
  }
  for(const path of ["/api/learning/catalog?grade=13","/api/learning/course?grade=9&subject=Unknown","/api/learning/content/invalid-id"])assert.equal((await json(path)).status,400);

  await browser.intercept(request=>request.url.includes("/api/learning/catalog")?{status:503,body:{error:{message:"Test: content server unavailable"}}}:null);
  await navigate(course,'document.querySelector("#subjects h2")?.textContent==="Learning content could not be opened"');
  assert.match(await evaluate('document.getElementById("subjects").textContent'),/content server unavailable/);
  assert.equal(await evaluate('document.getElementById("completed-count").textContent'),"—");
  assert.equal(await evaluate('!!document.getElementById("complete-lesson")'),false);
  await browser.stopIntercept();
  const fixture={id:"db-900001",key:"lesson:900001",grade:9,subject:"English",language:"en",stream:"common",chapter:"2. Writing",chapterId:"chapter-fixture",number:"1",title:"Simulated database lesson",sourceLabel:"Test fixture (not real curriculum)",sourceUrl:"https://example.invalid/reference",origin:"reviewed",content:"A published database lesson has readable explanations, examples and notes. This test verifies that the content reader uses the database detail response rather than a generic subject prompt. ".repeat(3),examples:["A worked example from the fixture."],keyPoints:["A test note."]};
  const fixtureCatalog=(await json("/api/learning/catalog?grade=9")).data;
  Object.assign(fixtureCatalog.subjects.find(subject=>subject.name==="English"),{lessonCount:1,chapterCount:1,availableKeys:[fixture.key],startLessonId:fixture.id});
  await browser.intercept(request=>{
    const url=new URL(request.url);
    if(url.pathname==="/api/learning/catalog"&&url.searchParams.get("grade")==="9")return {body:fixtureCatalog};
    if(url.pathname==="/api/learning/course"&&url.searchParams.get("subject")==="English")return {body:{grade:9,subject:"English",language:"en",lessonCount:1,chapters:[{id:fixture.chapterId,number:2,title:fixture.chapter,lessons:[fixture]}]}};
    if(url.pathname==="/api/learning/content/db-900001")return {body:{lesson:fixture}};
    return null;
  });
  await navigate("/learning/?grade=9&subject=English&lesson=db-900001&language=en",'document.getElementById("lesson-page")');
  assert.match(await evaluate('document.querySelector(".lesson-page").textContent'),/readable explanations/);
  assert.match(await evaluate('document.querySelector(".lesson-page").textContent'),/worked example/);
  assert.equal(await evaluate('document.querySelectorAll("#complete-lesson").length'),1);
  await evaluate('document.getElementById("complete-lesson").click()');
  assert.equal(await evaluate('document.getElementById("completed-count").textContent'),"1");
  const practiceHref=await evaluate('document.getElementById("start-practice").getAttribute("href")');
  assert.match(practiceHref,/grade=9/);assert.match(practiceHref,/subject=English/);
  await navigate(practiceHref,'document.getElementById("start-exam")');
  await browser.stopIntercept();
  console.log("PASS: published database lesson rendering/practice-link integration using browser-only API fixtures (no database records were changed).");
  await navigate(course,'document.querySelector(".history-lesson-link")');
  await command("Emulation.setDeviceMetricsOverride",{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await navigate("/learning/?grade=10&language=en");
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
  await navigate("/exams/",'document.getElementById("start-exam")');
  await navigate("/assistant/",'document.getElementById("historyList")');
  await command("Page.navigate",{url:`${origin}/account/`});
  await waitFor('location.pathname.startsWith("/account/") && (document.body.textContent.includes("Welcome back") || document.body.textContent.includes("sign-in setup"))');
  assert.deepEqual(browser.exceptions,[],"no uncaught browser errors");
  console.log("PASS: all 36 grade/subject routes and APIs; six real lesson journeys; all 60 MCQs, retry/scoring; chapters and previous/next; save/bookmark add/remove/reopen; reload progress and planner; summary-only loading; invalid routes; server-error recovery; desktop/mobile; protected endpoints; exam/assistant/account page smoke checks.");
  console.log("PASS: homepage Start Learning and subject links; History practice opens actual inline questions; Grade 9 English practice resolves to the available reviewed bank and requires login; topic completion persists and whole-lesson completion updates topic totals.");
  console.log("NOT VERIFIED: real signed-in account synchronization, authorized publishing, or cross-account isolation in a signed-in browser. State/sync failure logic is covered separately using mocked HTTP responses.");
} finally {await browser.close();}
