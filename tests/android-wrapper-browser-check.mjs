import assert from "node:assert/strict";
import { browserDriver } from "./browser-driver.mjs";

if (!process.env.REPLIT_DEV_DOMAIN) throw new Error("REPLIT_DEV_DOMAIN is required.");
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const browser = await browserDriver();
const { command, evaluate, waitFor } = browser;

async function navigate(path, ready) {
  await command("Page.navigate", { url: `${origin}${path}` });
  await waitFor(`location.href===${JSON.stringify(origin + path)} && document.readyState==="complete" && (${ready})`);
}

async function tapElement(selector) {
  const point = await evaluate(`(()=>{const element=${selector};if(!element)throw new Error("Missing tap target");element.scrollIntoView({block:"center",behavior:"instant"});const rect=element.getBoundingClientRect();const point={x:rect.x+rect.width/2,y:rect.y+rect.height/2};const hit=document.elementFromPoint(point.x,point.y);if(!hit||(hit!==element&&!element.contains(hit)))throw new Error("Tap target is obscured");return point;})()`);
  await command("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await new Promise(resolve => setTimeout(resolve, 60));
  await command("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function tapText(selector, text) {
  await tapElement(`([...document.querySelectorAll(${JSON.stringify(selector)})].find(element=>element.textContent.trim()===${JSON.stringify(text)}))`);
}

try {
  const manifestResponse = await fetch(`${origin}/manifest.webmanifest`);
  assert.equal(manifestResponse.status, 200);
  const webManifest = await manifestResponse.json();
  assert.equal(webManifest.name, "MINA TEACH AI");
  assert.equal(webManifest.description, "Dhaloota beekumsa omishuudha.");
  for (const icon of webManifest.icons.filter(icon => ["192x192", "512x512"].includes(icon.sizes))) {
    assert.equal((await fetch(new URL(icon.src, origin))).status, 200, `manifest icon ${icon.sizes} loads`);
  }

  const privacy = await fetch(`${origin}/privacy/`);
  assert.equal(privacy.status, 200);
  assert.match(await privacy.text(), /minaseyfufa@gmail\.com/);
  const assetLinks = await fetch(`${origin}/.well-known/assetlinks.json`);
  assert.equal(assetLinks.status, 404, "no unverified signing fingerprint is exposed as a valid association");

  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await command("Emulation.setUserAgentOverride", {
    userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  });

  await navigate("/", 'document.querySelector(".site-brand h1")?.textContent==="MINA TEACH AI"');
  assert.equal(await evaluate('document.querySelector("header > p")?.textContent'), "Dhaloota beekumsa omishuudha.");
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, "home page fits Android viewport");

  await navigate("/learning/?grade=10&subject=History", 'document.getElementById("subjects")?.children.length>0');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, "learning page fits Android viewport");

  await navigate("/assistant/", 'document.getElementById("chatForm")!==null');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, "assistant fits Android viewport");

  await navigate("/account/sign-in", 'document.getElementById("root")!==null');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, "account sign-in page fits Android viewport");

  const courseResponse = await fetch(`${origin}/api/learning/course?grade=10&subject=History&language=en`);
  assert.equal(courseResponse.status, 200);
  const course = await courseResponse.json();
  const lessons = course.chapters.flatMap(chapter => chapter.lessons);
  const firstLesson = lessons.find(lesson => lesson.id === "history10-1.1");
  assert.ok(firstLesson, "Grade 10 History lesson is present in its chapter sequence");
  await navigate(`/learning/?grade=10&subject=History&language=en&lesson=${firstLesson.id}`,
    'document.getElementById("lesson-page") && document.getElementById("start-practice")');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, "textbook lesson fits Android viewport");
  assert.match(await evaluate('document.getElementById("lesson-page").textContent'), /private ownership|capital/i, "the lesson contains educational notes");

  const initialPracticeStatus = await evaluate('document.getElementById("practice-status")?.textContent || ""');
  await tapElement('document.getElementById("start-practice")');
  await waitFor(`(()=>{const quiz=document.getElementById("lesson-practice"),status=document.getElementById("practice-status")?.textContent||"";return (!quiz?.hidden&&document.querySelectorAll("#lesson-practice .history-choice").length===4)||!!document.getElementById("resume-lesson-practice")||status!==${JSON.stringify(initialPracticeStatus)};})()`);
  if (await evaluate('!!document.getElementById("resume-lesson-practice")')) {
    await tapElement('document.getElementById("resume-lesson-practice")');
  }
  await waitFor('document.querySelectorAll("#lesson-practice .history-choice").length===4');
  const question = await fetch(`${origin}/api/learning/content/${firstLesson.id}`).then(response => response.json());
  const correctIndex = question.lesson.questions[0].answer;
  await tapElement(`document.querySelectorAll("#lesson-practice .history-choice")[${correctIndex}]`);
  await waitFor('document.querySelector("#lesson-practice .quiz-feedback")');
  assert.match(await evaluate('document.querySelector("#lesson-practice .quiz-feedback").textContent'), /Correct\\.|Explanation|because|answer/i);
  await tapText("#lesson-practice a", "Back to lesson content");
  await waitFor('document.getElementById("lesson-practice").hidden');

  await tapText("#lesson-page button", "☆ Save lesson");
  await waitFor('[...document.querySelectorAll("#lesson-page button")].some(button=>button.textContent.includes("Saved lesson"))');
  assert.equal(await evaluate('document.getElementById("complete-lesson").disabled'), false, "completion is enabled only on loaded lesson content");
  await tapElement('document.getElementById("complete-lesson")');
  await waitFor('document.getElementById("complete-lesson").textContent==="Completed ✓"');

  const nextLesson = lessons[lessons.indexOf(firstLesson) + 1];
  assert.ok(nextLesson, "Grade 10 History has a next lesson");
  await tapText('[aria-label="Lesson navigation"] a', "Next lesson");
  await waitFor(`new URLSearchParams(location.search).get("lesson")===${JSON.stringify(nextLesson.id)} && document.getElementById("lesson-page")`);
  await tapText('[aria-label="Lesson navigation"] a', "Previous lesson");
  await waitFor(`new URLSearchParams(location.search).get("lesson")===${JSON.stringify(firstLesson.id)} && document.getElementById("lesson-page")`);
  console.log("PASS: Android-sized touch interactions for Grade 10 History lesson, saved/completed state, practice answer/explanation, and Previous/Next navigation.");

  assert.deepEqual(browser.exceptions, [], "no uncaught browser exceptions");
  console.log("PASS: Android-sized Chrome checks for web manifest, icon URLs, privacy page, home, dashboard, assistant, account sign-in shell, and lesson interactions.");
  console.log("LIMITATION: This emulates Android Chrome; no physical device, signed TWA, authorized account, or Play Console test was available.");
} finally {
  await browser.close();
}
