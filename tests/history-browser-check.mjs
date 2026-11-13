// Run against a running app and a temporary Chromium instance with debugging enabled.
// This uses the browser's public DevTools protocol; no additional packages are required.
import assert from "node:assert/strict";

const debug = process.env.CHROME_DEBUG_URL || "http://127.0.0.1:9233";
if (!process.env.REPLIT_DEV_DOMAIN) throw new Error("REPLIT_DEV_DOMAIN is required for this preview test.");
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const tab = await fetch(`${debug}/json/new?about:blank`, {method: "PUT"}).then(response => response.json());
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, {once: true}); socket.addEventListener("error", reject, {once: true}); });
const pending = new Map();
const exceptions = [];
let sequence = 0;
socket.addEventListener("message", event => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.text);
  if (!message.id) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
});
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, {resolve, reject});
    socket.send(JSON.stringify({id, method, params}));
  });
}
async function evaluate(expression) {
  const result = await command("Runtime.evaluate", {expression, awaitPromise: true, returnByValue: true});
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${expression}`);
}
async function navigate(path, condition) {
  await command("Page.navigate", {url: `${origin}${path}`});
  await waitFor(`location.href === ${JSON.stringify(origin + path)} && document.readyState === "complete" && (${condition})`);
}
const course = "/learning/?grade=10&stream=social&subject=History";
try {
  await command("Page.enable"); await command("Runtime.enable");
  await command("Emulation.setDeviceMetricsOverride", {width: 390, height: 844, deviceScaleFactor: 1, mobile: true});
  await navigate(course, 'document.querySelectorAll(".history-lesson-link").length === 6');
  await evaluate('localStorage.removeItem("minaTeach.learning.v1")');
  await navigate(`${course}&lesson=1.1`, 'document.querySelector("#subjects > h3")?.textContent.includes("Features of Capitalism")');
  assert.equal(await evaluate('document.body.innerText.includes("Study prompt")'), false);
  assert.equal(await evaluate('document.body.innerText.includes("Historical sources")'), false);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, "mobile page must not overflow horizontally");
  await evaluate('document.querySelector(".history-lesson-actions button").click()');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("minaTeach.learning.v1")).saved.some(item => item.key === "curriculum:history:10:1.1")'), true);
  await evaluate('document.querySelectorAll(".history-lesson-actions")[0].children[1].click()');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("minaTeach.learning.v1")).completed.includes("curriculum:history:10:1.1")'), true);
  await evaluate('document.querySelectorAll(".history-lesson-actions")[0].children[2].click()');
  for (let index = 0; index < 10; index++) {
    await evaluate(`document.querySelectorAll(".history-choice")[window.MINA_G10_HISTORY.completeLessons[0].questions[${index}].answer].click()`);
    assert.match(await evaluate('document.querySelector(".quiz-feedback").textContent'), /Correct answer:/);
    await evaluate('document.querySelector(".history-quiz").lastElementChild.click()');
  }
  assert.match(await evaluate('document.querySelector(".history-quiz").textContent'), /10 \/ 10/);
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("minaTeach.learning.v1")).practice[0].score'), 10);
  await evaluate('document.querySelector(".history-quiz button").click()');
  for (let index = 0; index < 10; index++) {
    const selector = index === 0 ? "(window.MINA_G10_HISTORY.completeLessons[0].questions[0].answer + 1) % 4" : `window.MINA_G10_HISTORY.completeLessons[0].questions[${index}].answer`;
    await evaluate(`document.querySelectorAll(".history-choice")[${selector}].click()`);
    if (index === 0) assert.match(await evaluate('document.querySelector(".quiz-feedback").textContent'), /Not quite/);
    await evaluate('document.querySelector(".history-quiz").lastElementChild.click()');
  }
  assert.match(await evaluate('document.querySelector(".history-quiz").textContent'), /9 \/ 10/);
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("minaTeach.learning.v1")).practice.length'), 2);
  await evaluate('document.querySelector("#subjects > .history-lesson-actions:last-child button:last-child").click()');
  assert.equal(await evaluate('new URLSearchParams(location.search).get("lesson")'), "1.2");
  await evaluate('document.querySelector("#subjects > .history-lesson-actions:last-child button:first-child").click()');
  assert.equal(await evaluate('document.querySelector(".history-lesson-actions button").textContent'), "★ Saved lesson");
  assert.equal(await evaluate('document.querySelectorAll(".history-lesson-actions")[0].children[1].textContent'), "Completed ✓");
  for (let index = 0; index < 5; index++) await evaluate('document.querySelector("#subjects > .history-lesson-actions:last-child button:last-child").click()');
  assert.equal(await evaluate('new URLSearchParams(location.search).get("lesson")'), "1.2.4");
  assert.equal(await evaluate('document.querySelector("#subjects > .history-lesson-actions:last-child button:last-child").disabled'), true);
  for (const lessonNumber of ["1.2", "1.2.1", "1.2.2", "1.2.3", "1.2.4"]) {
    await navigate(`${course}&lesson=${lessonNumber}`, `document.querySelector("#subjects > h3")?.textContent.includes("Lesson ${lessonNumber}:")`);
    await evaluate('document.querySelectorAll(".history-lesson-actions")[0].children[2].click()');
    for (let index = 0; index < 10; index++) {
      await evaluate(`document.querySelectorAll(".history-choice")[window.MINA_G10_HISTORY.completeLessons.find(lesson => lesson.number === ${JSON.stringify(lessonNumber)}).questions[${index}].answer].click()`);
      assert.match(await evaluate('document.querySelector(".quiz-feedback").textContent'), /Correct answer:/);
      await evaluate('document.querySelector(".history-quiz").lastElementChild.click()');
    }
    assert.match(await evaluate('document.querySelector(".history-quiz").textContent'), /10 \/ 10/);
  }
  await navigate("/learning/?grade=10&stream=social", 'document.querySelector("#saved-lessons a")');
  assert.equal(await evaluate('document.getElementById("completed-count").textContent'), "1");
  assert.match(await evaluate('document.getElementById("quiz-progress").textContent'), /AI-authored practice/);
  await evaluate('document.querySelector("#saved-lessons a").click()');
  await waitFor('document.querySelector("#subjects > h3")?.textContent.includes("Features of Capitalism")');
  assert.equal(await evaluate('document.querySelector(".history-lesson-actions button").textContent'), "★ Saved lesson");
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  await evaluate('document.querySelector("#subjects > a").click()');
  assert.equal(await evaluate('document.getElementById("subjects").classList.contains("history-curriculum")'), false);
  assert.equal(await evaluate('document.querySelector(".content-grid").classList.contains("history-mode")'), false);
  const status = await evaluate(`fetch("/api/questions/manage").then(response => response.status)`);
  assert.equal(status, 401, "authoring tools require sign-in");
  await navigate("/exams/", 'document.getElementById("start-exam")');
  await navigate("/assistant/", 'document.getElementById("historyList")');
  assert.deepEqual(exceptions, [], "no uncaught browser exceptions");
  console.log("PASS: mobile layout, six-lesson navigation, all 60 MCQs rendered and answered, correct/incorrect feedback, 10/10 and 9/10 scoring, retry, saved-lesson reopening, local completion, score persistence, protected management, exam and AI Assistant page smoke checks.");
  console.log("NOT TESTED: signed-in account synchronization or educator review/approval.");
} finally {
  await fetch(`${debug}/json/close/${tab.id}`).catch(() => {});
  socket.close();
}
