import assert from "node:assert/strict";
import {browserDriver} from "./browser-driver.mjs";
const android=process.argv.includes("--android"),origin=`https://${process.env.REPLIT_DEV_DOMAIN}`;
if(!process.env.REPLIT_DEV_DOMAIN)throw new Error("REPLIT_DEV_DOMAIN is required.");
const browser=await browserDriver(),{evaluate,waitFor,command}=browser;
const counts={device:android?"Android-emulated Chrome":"Desktop Chrome",homeSubjects:0,gradePages:0,subjects:0,chapters:0,topicLinks:0,practiceLinks:0,practiceWithNoQuestions:0,lessonNavigation:0,topicNavigation:0};
const uniqueTopics=new Set(),apiCache=new Map();
async function api(path){if(!apiCache.has(path)){const response=await fetch(origin+path);assert.equal(response.status,200,path);apiCache.set(path,await response.json());}return apiCache.get(path);}
async function navigate(path,condition){await command("Page.navigate",{url:origin+path});await waitFor(condition);}
async function tapExpression(expression){
  const painted='new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))';
  await evaluate(painted);
  await evaluate(`(()=>{const element=${expression};if(!element)throw new Error("Missing clickable element");element.scrollIntoView({block:"center",behavior:"instant"});})()`);
  await evaluate(painted);
  const point=await evaluate(`(()=>{const element=${expression},rect=element.getClientRects()[0];if(!rect||!rect.width||!rect.height)throw new Error("Control is not visible");const point={x:rect.x+rect.width/2,y:rect.y+rect.height/2},hit=document.elementFromPoint(point.x,point.y);if(!hit || !(hit===element || element.contains(hit)))throw new Error("Tap target is obscured: "+element.outerHTML.slice(0,300));return point;})()`);
  if(android){await command("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[point]});await new Promise(resolve=>setTimeout(resolve,50));await command("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});}
  else{await command("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,...point});await command("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,...point});}
}
const tap=selector=>tapExpression(`document.querySelector(${JSON.stringify(selector)})`);
const tapLink=(text,selector="a")=>tapExpression(`[...document.querySelectorAll(${JSON.stringify(selector)})].find(a=>a.textContent.trim()===${JSON.stringify(text)})`);
const tapHref=(href,selector="a")=>tapExpression(`[...document.querySelectorAll(${JSON.stringify(selector)})].find(a=>a.getAttribute("href")===${JSON.stringify(href)})`);
const dashboardReady='document.querySelectorAll(".subject-card").length===17';
async function choose(id,value){await evaluate(`document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(String(value))};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event("change",{bubbles:true}))`);await waitFor(dashboardReady);assert.equal(await evaluate(`document.getElementById(${JSON.stringify(id)}).value`),String(value));}
const courseReady='document.querySelector("#subjects h2")?.textContent.includes("Chapters and lessons")';
const lessonReady=id=>`document.getElementById("lesson-page") && new URLSearchParams(location.search).get("lesson")===${JSON.stringify(id)}`;
const chapterReady=id=>`${courseReady} && new URLSearchParams(location.search).get("chapter")===${JSON.stringify(id)}`;
const topicReady=(id,topic)=>`${lessonReady(id)} && document.querySelector('[aria-label="Topic navigation"] [aria-current]')?.dataset.topicId===${JSON.stringify(String(topic))}`;
async function checkScope(grade,subject,language){
  const params=await evaluate("Object.fromEntries(new URLSearchParams(location.search))");
  assert.equal(params.grade,String(grade));assert.equal(params.subject,subject);assert.equal(params.language || "en",language);
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
}
async function openChapter(id){
  const href=await evaluate(`[...document.querySelectorAll(".history-unit-card>a")].find(a=>new URL(a.href).searchParams.get("chapter")===${JSON.stringify(id)})?.getAttribute("href")`);
  assert.ok(href);
  const panel=`[...document.querySelectorAll(".history-unit-card")].find(panel=>[...panel.querySelectorAll(":scope>a")].some(a=>a.getAttribute("href")===${JSON.stringify(href)}))`;
  if(!await evaluate(`${panel}.open`))await tapExpression(`${panel}.querySelector("summary")`);
  await tapHref(href,".history-unit-card>a");await waitFor(chapterReady(id));
}
async function practice(href,grade,subject,language,returnLesson=null){
  counts.practiceLinks++;
  await tapHref(href);
  if(href.startsWith("/learning/")) {
    await waitFor('document.getElementById("lesson-practice")?.hidden===false');
    const id=await evaluate('new URLSearchParams(location.search).get("lesson")'),{lesson}=await api(`/api/learning/content/${id}`);
    if(lesson.questions?.length)assert.match(await evaluate('document.getElementById("lesson-practice").textContent'),new RegExp(lesson.questions[0].prompt.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
    assert.equal(await evaluate('document.querySelectorAll("#lesson-practice .history-choice").length'),4);
    await tapLink("Back to lesson content","#lesson-practice a");await waitFor('document.getElementById("lesson-practice").hidden');
    await tapLink("← All chapters","#subjects>a");await waitFor(courseReady);
  } else {
    await waitFor('document.getElementById("bank-status") && !document.getElementById("bank-status").textContent.includes("Checking")');
    assert.equal(await evaluate('document.getElementById("grade").value'),String(grade));
    assert.equal(await evaluate('document.getElementById("subject").value'),subject);
    const filters=await evaluate('Object.fromEntries(["grade","stream","subject","topic"].map(id=>[id,document.getElementById(id).value]))');
    const expected=await api(`/api/questions?${new URLSearchParams(filters)}`);
    assert.equal(await evaluate('document.getElementById("start-exam").disabled'),expected.count<10);
    if(expected.count>=10){await tap("#start-exam");await waitFor('document.getElementById("bank-status").textContent==="Sign in before starting an exam."');}
    else counts.practiceWithNoQuestions++;
    const back=await evaluate('document.getElementById("return-to-learning").getAttribute("href")');
    assert.ok(back.startsWith("/learning/"));
    await tap("#return-to-learning");await waitFor(returnLesson?lessonReady(returnLesson):courseReady);
  }
  await checkScope(grade,subject,language);
}
async function inlinePractice(lesson) {
  const previousStatus=await evaluate('document.getElementById("practice-status")?.textContent || ""');
  await tap("#start-practice");
  const practiceReady=`(()=>{const quiz=document.getElementById("lesson-practice"),status=document.getElementById("practice-status")?.textContent||"";return (!quiz?.hidden&&document.querySelectorAll("#lesson-practice .history-choice").length===4)||status!==${JSON.stringify(previousStatus)};})()`;
  await waitFor(practiceReady);
  let initial=await evaluate('({visible:!document.getElementById("lesson-practice")?.hidden,choices:document.querySelectorAll("#lesson-practice .history-choice").length,status:document.getElementById("practice-status")?.textContent,error:document.querySelector("#lesson-practice .lesson-practice-error")?.textContent,quiz:document.getElementById("lesson-practice")?.textContent})');
  assert.equal(initial.visible,true,`${lesson.id}: lesson practice did not open (${initial.status || initial.error})`);
  if(initial.choices===0 && await evaluate('!!document.getElementById("resume-lesson-practice")')) {
    await tap("#resume-lesson-practice");
    await waitFor('document.querySelectorAll("#lesson-practice .history-choice").length===4');
    initial=await evaluate('({visible:!document.getElementById("lesson-practice")?.hidden,choices:document.querySelectorAll("#lesson-practice .history-choice").length,status:document.getElementById("practice-status")?.textContent,error:document.querySelector("#lesson-practice .lesson-practice-error")?.textContent,quiz:document.getElementById("lesson-practice")?.textContent})');
  }
  assert.equal(initial.choices,4,`${lesson.id}: lesson practice did not load four choices (${initial.error || initial.status})`);
  if(lesson.questions?.length) {
    if(await evaluate('[...document.querySelectorAll("#lesson-practice .history-choice")].some(button=>!button.disabled)'))
      await tap(`#lesson-practice .history-choice:nth-of-type(${lesson.questions[0].answer+1})`);
    await waitFor('document.querySelector("#lesson-practice .quiz-feedback")');
  }
  await tapLink("Back to lesson content","#lesson-practice a");await waitFor('document.getElementById("lesson-practice").hidden');
  await tap("#start-practice");
  await waitFor('document.getElementById("lesson-practice")?.hidden===false && document.getElementById("resume-lesson-practice")');
  await tap("#resume-lesson-practice");
  await waitFor('document.querySelectorAll("#lesson-practice .history-choice").length===4');
  if(lesson.questions?.length)assert.equal(await evaluate('[...document.querySelectorAll("#lesson-practice .history-choice")].every(button=>button.disabled)'),true,"returning to the content must not allow scoring the same answer twice");
  await tapLink("Back to lesson content","#lesson-practice a");
}
async function availableCourse(course,language) {
  const flat=course.chapters.flatMap(chapter=>chapter.lessons);
  for(const [chapterIndex,chapter] of course.chapters.entries()) {
    await openChapter(chapter.id);counts.chapters++;
    for(const [step,label,opposite] of [[1,"Next chapter","Previous chapter"],[-1,"Previous chapter","Next chapter"]]) {
      const target=course.chapters[chapterIndex+step];
      if(target){await tapLink(label,'[aria-label="Chapter navigation"] a');await waitFor(chapterReady(target.id));await tapLink(opposite,'[aria-label="Chapter navigation"] a');await waitFor(chapterReady(chapter.id));}
    }
    await tap(".history-unit-card>a:last-child");await waitFor(lessonReady(chapter.lessons[0].id));
    await tapLink("Open chapter","#subjects>a");await waitFor(chapterReady(chapter.id));
    for(const meta of chapter.lessons) {
      const href=await evaluate(`[...document.querySelectorAll(".history-lesson-link")].find(a=>new URL(a.href).searchParams.get("lesson")===${JSON.stringify(meta.id)}).getAttribute("href")`);
      await tapHref(href,".history-lesson-link");await waitFor(lessonReady(meta.id));
      const {lesson}=await api(`/api/learning/content/${meta.id}`);
      for(const [step,label,opposite] of [[1,"Next lesson","Previous lesson"],[-1,"Previous lesson","Next lesson"]]) {
        const target=flat[flat.findIndex(item=>item.id===meta.id)+step];
        if(target){await tapLink(label,'[aria-label="Lesson navigation"] a');await waitFor(lessonReady(target.id));await tapLink(opposite,'[aria-label="Lesson navigation"] a');await waitFor(lessonReady(meta.id));counts.lessonNavigation+=2;}
      }
      const practiceHref=await evaluate('document.getElementById("start-practice").getAttribute("href")');
      if(practiceHref)await practice(practiceHref,course.grade,course.subject,language,meta.id);
      else{counts.practiceLinks++;await inlinePractice(lesson);}
      for(const [index,topic] of meta.topicOutline.entries()) {
        await tapExpression(`[...document.querySelectorAll('[aria-label="Topic navigation"] a[data-topic-id]')].find(a=>a.dataset.topicId===${JSON.stringify(topic.id)})`);
        await waitFor(topicReady(meta.id,topic.id));await checkScope(course.grade,course.subject,language);
        assert.ok(await evaluate(`document.getElementById(${JSON.stringify("topic-"+topic.id)})?.textContent.trim().length>20`));
        uniqueTopics.add(`${language}:${meta.id}:${topic.id}`);counts.topicLinks++;
        const topicPractice=await evaluate('document.getElementById("start-practice").getAttribute("href")');
        if(topicPractice)await practice(topicPractice,course.grade,course.subject,language,meta.id);
        else{counts.practiceLinks++;await inlinePractice(lesson);}
        await waitFor(topicReady(meta.id,topic.id));
        const next=meta.topicOutline[index+1];
        if(next){await tapLink("Next topic",'[aria-label="Topic navigation"] a');await waitFor(topicReady(meta.id,next.id));await tapLink("Previous topic",'[aria-label="Topic navigation"] a');await waitFor(topicReady(meta.id,topic.id));counts.topicNavigation+=2;}
      }
      await tapLink("Open chapter","#subjects>a");await waitFor(chapterReady(chapter.id));
      for(const topic of meta.topicOutline) {
        const details=`[...document.querySelectorAll(".history-lesson-link")].find(a=>new URL(a.href).searchParams.get("lesson")===${JSON.stringify(meta.id)}).nextElementSibling`;
        if(!await evaluate(`${details}.open`))await tapExpression(`${details}.querySelector("summary")`);
        await tapExpression(`[...document.querySelectorAll("a.topic-link")].find(a=>new URL(a.href).searchParams.get("lesson")===${JSON.stringify(meta.id)}&&a.dataset.topicId===${JSON.stringify(topic.id)})`);
        await waitFor(topicReady(meta.id,topic.id));counts.topicLinks++;
        await tapLink("Open chapter","#subjects>a");await waitFor(chapterReady(chapter.id));
      }
    }
    await tapLink("All chapters","#subjects>a");await waitFor(courseReady);
  }
}
async function subjectFlow(subject,grade,language) {
  await tap(`.subject-card[aria-label="Open ${subject.name}, Grade ${grade}"]`);await waitFor(courseReady);await checkScope(grade,subject.name,language);counts.subjects++;
  const course=await api(`/api/learning/course?${new URLSearchParams({grade,subject:subject.name,language})}`);
  if(!course.lessonCount)assert.match(await evaluate('document.getElementById("subjects").textContent'),/No learning content is published/);
  const practices=await evaluate('[...document.querySelectorAll("#subjects>.subject-practice")].map(a=>a.getAttribute("href"))');
  assert.ok(practices.length,`${grade} ${subject.name} has a working availability/practice route`);
  for(const href of practices)await practice(href,grade,subject.name,language);
  if(course.lessonCount)await availableCourse(course,language);
  await tapLink("← Back to dashboard","#subjects>a");await waitFor(dashboardReady);
}
try {
  await command("Emulation.setDeviceMetricsOverride",{width:android?390:1280,height:android?844:900,deviceScaleFactor:1,mobile:android});
  if(android){await command("Emulation.setUserAgentOverride",{userAgent:"Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"});await command("Emulation.setTouchEmulationEnabled",{enabled:true,maxTouchPoints:5});}
  if(!process.argv.includes("--routing-only")) {
  await navigate("/",'document.querySelectorAll("a.card").length>=10');
  const home=await evaluate('[...document.querySelectorAll("a.card")].map(a=>a.getAttribute("href"))');
  for(const href of home){await tapHref(href,"a.card");await waitFor(courseReady);counts.homeSubjects++;await tap('.topbar a[href="/"]');await waitFor('document.querySelectorAll("a.card").length>=10');}
  await tap(".hero .btn");await waitFor(dashboardReady);
  for(const grade of [9,10,11,12]) {
    await choose("grade",grade);counts.gradePages++;
    const catalog=await api(`/api/learning/catalog?grade=${grade}&language=en`);
    for(const subject of catalog.subjects)await subjectFlow(subject,grade,"en");
    console.log(`PASS ${counts.device}: Grade ${grade}, every subject and its practice route individually clicked.`);
  }
  for(const language of ["om","am"]) {
    await choose("language",language);
    for(const grade of [9,10,11,12]) {
      await choose("grade",grade);counts.gradePages++;
      const catalog=await api(`/api/learning/catalog?grade=${grade}&language=${language}`);
      for(const subject of catalog.subjects.filter(subject=>subject.lessonCount))await subjectFlow(subject,grade,language);
    }
  }
  }
  for(const path of ["/learning/?grade=10&subject=History&language=en&lesson=history10-1.1&topic=unknown","/learning/?grade=10&subject=History&language=en&lesson=history10-1.1&material=unknown","/learning/?grade=9&subject=Mathematics&language=en&chapter=unknown","/learning/?grade=9&language=en&topic=0"]) {
    await navigate(path,'document.querySelector("#subjects h2")?.textContent==="Learning content could not be opened"');await tapLink("Back to dashboard","#subjects>a");await waitFor(dashboardReady);
  }
  const saved={selection:{grade:9,subject:"English",stream:"natural",topic:"Unit 1: Living in Urban Areas",mode:"practice",questionCount:10,returnTo:"/learning/?grade=9&subject=English&language=en"},attempt:{attemptId:"browser-only-resume-fixture",mode:"practice",total:10,questions:Array.from({length:10},(_,index)=>({id:`technical-only-${index}`,grade:9,stream:"common",subject:"English",chapter:"Unit 1: Living in Urban Areas",prompt:`Technical resume-routing fixture ${index+1}; not published content`,sourceLabel:"Browser-only technical test, not published learning content",sourceKind:"technical_fixture",choices:["A","B","C","D"]}))}};
  await evaluate(`sessionStorage.setItem("mina-teach-active-exam-v1",${JSON.stringify(JSON.stringify(saved))})`);
  await navigate("/exams/?difficulty=invalid",'document.getElementById("bank-status")?.textContent.includes("invalid selection")');
  assert.equal(await evaluate('document.getElementById("exam").hidden'),true);
  await navigate("/exams/?grade=9&subject=English&stream=natural&topic=Unit%201%3A%20Living%20in%20Urban%20Areas&question-count=20",'document.getElementById("bank-status")?.textContent.includes("reviewed questions available")');
  assert.equal(await evaluate('document.getElementById("exam").hidden'),true);
  await navigate("/exams/?grade=12&subject=Mathematics&stream=natural",'document.getElementById("bank-status")?.textContent.includes("reviewed questions available")');
  assert.equal(await evaluate('document.getElementById("setup").hidden'),false);assert.equal(await evaluate('document.getElementById("exam").hidden'),true);
  await tap("#resume-saved");await waitFor('!document.getElementById("exam").hidden && document.body.textContent.includes("Technical resume-routing fixture")');
  await tap("#return-to-learning");await waitFor(courseReady);
  const incomplete=structuredClone(saved);delete incomplete.attempt.questions[0].sourceKind;
  await evaluate(`sessionStorage.setItem("mina-teach-active-exam-v1",${JSON.stringify(JSON.stringify(incomplete))})`);
  await navigate("/exams/?grade=9&subject=English",'document.getElementById("resume-message")?.textContent.includes("cannot be resumed safely")');
  assert.equal(await evaluate('document.getElementById("resume-saved").disabled'),true);
  assert.equal(await evaluate('sessionStorage.getItem("mina-teach-active-exam-v1")'),JSON.stringify(incomplete));
  await evaluate('sessionStorage.removeItem("mina-teach-active-exam-v1")');
  await navigate("/exams/?grade=8&subject=Unknown",'document.getElementById("bank-status")?.textContent.includes("invalid selection")');
  assert.equal(await evaluate('document.getElementById("start-exam").disabled'),true);
  await navigate("/exams/?grade=9&subject=English&stream=natural&returnTo=https%3A%2F%2Fexample.invalid%2F",'document.getElementById("bank-status")?.textContent.includes("reviewed questions available")');
  assert.equal(await evaluate('new URL(document.getElementById("return-to-learning").href).origin'),origin);
  await browser.intercept(async request=>{
    const url=new URL(request.url);if(url.pathname!=="/api/questions")return null;
    if(url.searchParams.get("grade")==="9" && url.searchParams.get("subject")==="English"){await new Promise(resolve=>setTimeout(resolve,500));return {body:{count:60,questions:[]}};}
    return {body:{count:0,questions:[]}};
  },["*api/questions*"]);
  await evaluate('document.getElementById("question-count").value="20";document.getElementById("question-count").dispatchEvent(new Event("change"));document.getElementById("grade").value="12";document.getElementById("grade").dispatchEvent(new Event("change"));document.getElementById("subject").value="Physics";document.getElementById("subject").dispatchEvent(new Event("change"))');
  await waitFor('document.getElementById("bank-status").textContent.includes("0 currently match")');
  await new Promise(resolve=>setTimeout(resolve,750));
  assert.equal(await evaluate('document.getElementById("start-exam").disabled'),true);assert.match(await evaluate('document.getElementById("bank-status").textContent'),/0 currently match/);
  await browser.stopIntercept();
  assert.deepEqual(browser.exceptions,[]);
  assert.deepEqual(browser.responses.filter(response=>response.url.startsWith(origin)&&response.status>=500),[]);
  console.log(JSON.stringify({...counts,uniqueAvailableTopics:uniqueTopics.size,uncaughtErrors:0,serverErrors:0,limitations:["Actual Android hardware was not tested.","Reviewed exam creation correctly requires login; no signed-in session was available.","Empty banks and missing curriculum remain data gaps, not successful study/practice sessions."]},null,2));
}finally{await browser.close();}
