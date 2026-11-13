import assert from "node:assert/strict";

// Browser-only account responses exercise identity transitions without signing in,
// bypassing server authentication, or changing any real user's records.
export async function checkLessonPracticeRecovery({browser,navigate,json,lessons,course}) {
  const {evaluate,waitFor,command}=browser;
  const detail=(await json(`/api/learning/content/${lessons[0].id}`)).data.lesson;
  const path=`${course}&lesson=${detail.id}`;
  const key="minaTeach.learning.v1";
  const text=()=>evaluate('document.getElementById("lesson-practice").textContent');
  async function open() {
    await evaluate('document.getElementById("start-practice").click()');
    await waitFor('!document.getElementById("lesson-practice").hidden && document.querySelector(".history-choice, #resume-lesson-practice, #lesson-practice button")');
  }
  async function choose(index) {
    await evaluate(`document.querySelectorAll(".history-choice")[${index}].click()`);
    await waitFor('document.querySelector(".quiz-feedback")');
  }
  async function next(index) {
    await evaluate(`{const next=document.getElementById("lesson-practice").lastElementChild;next.click();${index===detail.questions.length?"next.click();":""}}`);
    await waitFor(index===detail.questions.length?'document.getElementById("lesson-practice").textContent.includes("Practice complete")':`document.querySelector("#lesson-practice h3")?.textContent==="Question ${index+1} of ${detail.questions.length}"`);
  }
  async function resume() {
    await evaluate('document.getElementById("resume-lesson-practice").click()');
    await waitFor('document.querySelector(".history-choice")');
  }
  await navigate(path,'document.getElementById("lesson-page")');
  await open();
  if(await evaluate('!!document.getElementById("restart-lesson-practice")')) {
    await evaluate('document.getElementById("restart-lesson-practice").click()');
    await waitFor('document.querySelector(".history-choice")');
  }
  const examSentinel='{"test":"reviewed bank remains separate"}';
  await evaluate(`sessionStorage.setItem("mina-teach-active-exam-v1",${JSON.stringify(examSentinel)})`);
  await choose((detail.questions[0].answer+1)%4);
  await next(1);
  await choose(detail.questions[1].answer);
  await command("Page.reload");
  await waitFor('document.getElementById("start-practice")');
  await open();
  assert.match(await text(),/Continue saved lesson practice/);
  await resume();
  assert.match(await text(),/Question 2 of 10/);
  assert.equal(await evaluate('document.querySelectorAll(".history-choice:disabled").length'),4);
  assert.equal(await evaluate('document.querySelector(".history-choice[aria-pressed=true]").textContent'),`${String.fromCharCode(65+detail.questions[1].answer)}. ${detail.questions[1].choices[detail.questions[1].answer]}`);
  // Exercise popstate navigation through the dashboard's real grade control.
  await evaluate('document.getElementById("grade").value="11";document.getElementById("grade").dispatchEvent(new Event("change"))');
  await waitFor('!document.getElementById("lesson-page")');
  await evaluate("history.back()");
  await waitFor('document.getElementById("lesson-page")');
  await open();await resume();
  assert.match(await text(),/Question 2 of 10/);
  await evaluate("history.forward()");
  await waitFor('!document.getElementById("lesson-page")');
  await evaluate("history.back()");
  await waitFor('document.getElementById("lesson-page")');
  await open();await resume();
  await next(2);
  for(let index=2;index<detail.questions.length;index++) {
    await choose(detail.questions[index].answer);await next(index+1);
  }
  assert.match(await text(),/9 \/ 10/);
  const completed=await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})).practice.length`);
  await command("Page.reload");
  await waitFor('document.getElementById("start-practice")');
  await open();
  assert.doesNotMatch(await text(),/Continue saved/,"completed draft was removed");
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})).practice.length`),completed);
  await choose(detail.questions[0].answer);await next(1);
  await navigate(`${course}&lesson=${lessons[1].id}`,'document.getElementById("lesson-page")');
  await open();
  assert.doesNotMatch(await text(),/Continue saved/,"another lesson has its own draft");
  await navigate(path,'document.getElementById("lesson-page")');await open();
  await evaluate('document.getElementById("restart-lesson-practice").click()');
  await waitFor('document.querySelector("#lesson-practice h3")?.textContent==="Question 1 of 10"');
  assert.equal(await evaluate('document.querySelector(".quiz-feedback")===null'),true);

  let user="practice_A",changedContent=false;
  const writes=[];
  await browser.intercept(request=>{
    const url=new URL(request.url);
    if(url.pathname==="/api/account/status")return {body:{signedIn:!!user,userId:user}};
    if(url.pathname==="/api/account/data/learning"){writes.push(JSON.parse(request.postData));return {body:{saved:true}};}
    if(url.pathname==="/api/account/data")return {body:{records:{}}};
    if(changedContent && url.pathname===`/api/learning/content/${detail.id}`) {
      const lesson=structuredClone(detail);lesson.questions[0].explanation+=" Content revision.";
      return {body:{lesson}};
    }
    return null;
  },["*api/account/*","*api/learning/content/*"]);
  try {
    await navigate(path,'document.getElementById("lesson-page")');await open();
    assert.doesNotMatch(await text(),/Continue saved/,"signed-in account does not inherit guest draft");
    await choose(detail.questions[0].answer);await next(1);
    user="practice_B";
    // An already-open A tab must not write after B signs in.
    await evaluate('document.querySelector(".history-choice").click()');
    await waitFor('document.body.textContent.includes("Your account changed")');
    assert.match(await evaluate('document.querySelector("#lesson-practice [role=alert]").textContent'),/Your account changed/);
    await navigate(path,'document.getElementById("lesson-page")');await open();
    assert.doesNotMatch(await text(),/Continue saved/,"second account cannot see first account draft");
    await choose(detail.questions[0].answer);
    user="practice_A";
    await navigate(path,'document.getElementById("lesson-page")');await open();await resume();
    assert.match(await text(),/Question 2 of 10/);
    assert.equal(await evaluate('document.querySelector(".quiz-feedback")===null'),true);
    changedContent=true;
    await navigate(path,'document.getElementById("lesson-page")');await open();
    assert.match(await text(),/no longer be resumed/);
    assert.match(await evaluate('document.body.textContent'),/Saved practice expired/);
    await evaluate('document.querySelector("#lesson-practice button").click()');
    await waitFor('document.querySelector(".history-choice")');
    user=null;
    await navigate(path,'document.getElementById("lesson-page")');await open();
    assert.match(await text(),/no longer be resumed/,"guest content revision also expires old draft");
    assert.equal(await evaluate('sessionStorage.getItem("mina-teach-active-exam-v1")'),examSentinel);
    assert.equal(writes.some(write=>write.data._lessonPracticeDrafts),false);
  } finally {
    await browser.stopIntercept();
    await evaluate(`for(const key of Object.keys(localStorage))if(key.startsWith("minaTeach.learning.v1:account:practice_"))localStorage.removeItem(key);sessionStorage.removeItem("mina-teach-active-exam-v1")`);
  }
  console.log("PASS: lesson practice reload, back/forward, saved answer/position, restart, resumed scoring, lesson/account isolation, live account switch protection, content revision expiry, separate reviewed exam storage (browser-only account fixtures).");
}
