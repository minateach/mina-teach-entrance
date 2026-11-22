import assert from "node:assert/strict";
import {browserDriver} from "./browser-driver.mjs";

if(!process.env.REPLIT_DEV_DOMAIN)throw new Error("REPLIT_DEV_DOMAIN is required.");
const origin=`https://${process.env.REPLIT_DEV_DOMAIN}`;
const browser=await browserDriver();
const {command,evaluate,waitFor}=browser;
async function navigate(path,condition="document.readyState==='complete'") {
  await command("Page.navigate",{url:`${origin}${path}`});
  await waitFor(`location.href===${JSON.stringify(origin+path)} && (${condition})`);
}
async function setOffline(offline) {
  await command("Network.emulateNetworkConditions",{
    offline,latency:0,downloadThroughput:offline?0:10_000_000,uploadThroughput:offline?0:10_000_000,
  });
  await waitFor(`navigator.onLine===${!offline}`);
}

try {
  await command("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate("/");
  await waitFor("navigator.serviceWorker?.controller && document.getElementById('offline-connection-status')");
  await evaluate("navigator.serviceWorker.ready");

  await navigate("/learning/?grade=10&subject=History&language=en",
    'document.querySelector(".history-lesson-link")');
  await evaluate('document.querySelector(".history-lesson-link").click()');
  await waitFor('document.getElementById("lesson-page")');
  const lessonUrl=await evaluate("location.pathname+location.search");
  await evaluate('document.querySelector(".lesson-page button").textContent.includes("Save lesson") && [...document.querySelectorAll(".lesson-page button")].find(button=>button.textContent.includes("Download for offline"))?.click()');
  await waitFor('document.querySelector(".lesson-page").innerText.includes("Available offline")');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,"lesson view fits Android width");
  await navigate("/learning/?grade=10&subject=History&language=en",
    'document.querySelector(".course-card button[aria-label=\\"Download Grade 10 History offline\\"]")');
  await evaluate('document.querySelector(".course-card button[aria-label=\\"Download Grade 10 History offline\\"]').click()');
  await waitFor('document.getElementById("offline-bulk-status").textContent.includes("lessons saved offline")');
  assert.equal(await evaluate('document.getElementById("offline-storage-usage").textContent.includes("40 MB")'),true,"device storage usage and capacity are displayed");
  await evaluate('const t=document.getElementById("offline-mode-toggle");t.checked=true;t.dispatchEvent(new Event("change",{bubbles:true}))');
  assert.equal(await evaluate('localStorage.getItem("minaTeach.offlineMode.v1")==="on"'),true,"Offline Mode setting is saved");
  await navigate(lessonUrl,'document.getElementById("lesson-page") && document.querySelector(".lesson-page h2")');
  assert.match(await evaluate('document.getElementById("offline-connection-status").textContent'),/Offline Mode is on/);
  assert.match(await evaluate('document.querySelector(".lesson-page").textContent'),/Complete lesson notes|Introduction/);
  await evaluate('const t=document.getElementById("offline-mode-toggle");t.checked=false;t.dispatchEvent(new Event("change",{bubbles:true}))');
  await setOffline(true);
  await navigate(lessonUrl,'document.getElementById("lesson-page") && document.querySelector(".lesson-page h2")');
  assert.match(await evaluate('document.getElementById("offline-connection-status").textContent'),/Offline/);
  assert.match(await evaluate('document.querySelector(".lesson-page").textContent'),/Complete lesson notes|Introduction/);
  await evaluate('document.getElementById("start-practice").click()');
  await waitFor('document.querySelector(".history-choice") || document.getElementById("lesson-practice").textContent.includes("Complete")');
  assert.equal(await evaluate('document.getElementById("complete-lesson").disabled'),false);
  await evaluate('document.getElementById("complete-lesson").click()');
  await waitFor(`(async()=>{const local=JSON.parse(localStorage.getItem("minaTeach.learning.v1"));const db=await new Promise((resolve,reject)=>{const request=indexedDB.open("mina-teach-offline");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});const record=await new Promise((resolve,reject)=>{const request=db.transaction("downloads").objectStore("downloads").get("guest::learning-state:v1");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});db.close();return local?.completed?.length>0&&record?.data?.state?.completed?.some(key=>local.completed.includes(key))})()`);

  await setOffline(false);
  const examUrl="/exams/?grade=9&stream=natural&subject=English&question-count=10";
  await navigate(examUrl,'document.getElementById("start-exam")');
  await waitFor('document.getElementById("bank-status").textContent.includes("reviewed questions available")');
  await evaluate('document.getElementById("download-offline").click()');
  await waitFor('document.getElementById("offline-download-status").textContent.includes("saved for offline practice")');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,"exam setup fits Android width");

  await setOffline(true);
  await navigate(examUrl,'document.getElementById("bank-status").textContent.includes("Offline:") && !document.getElementById("start-exam").disabled');
  await evaluate('document.getElementById("start-exam").click()');
  await waitFor('document.getElementById("question").textContent.length>0');
  await evaluate('document.getElementById("bookmark").click()');
  assert.equal(await evaluate('window.MinaOffline.readBookmarks().length'),1,"question bookmark saved locally");
  await waitFor(`(async()=>{const db=await new Promise((resolve,reject)=>{const request=indexedDB.open("mina-teach-offline");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});const record=await new Promise((resolve,reject)=>{const request=db.transaction("downloads").objectStore("downloads").get("guest::exam-bookmarks:v1");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});db.close();return record?.data?.bookmarks?.length===1})()`);
  await evaluate('document.querySelector(".choice").click()');
  await waitFor('!document.getElementById("answer-feedback").hidden');
  await command("Page.reload");
  await waitFor('document.getElementById("exam") && !document.getElementById("exam").hidden && document.getElementById("progress").textContent.includes("Question 1 of 10")');
  assert.equal(await evaluate('window.MinaOffline.readBookmarks().length'),1,"device bookmark survives reload");
  assert.equal(await evaluate('!document.getElementById("answer-feedback").hidden'),true,"unfinished offline answer and feedback survive reload");
  const total=await evaluate('document.getElementById("progress").textContent.match(/of (\\d+)/)?.[1]');
  assert.equal(Number(total),10);
  for(let index=0;index<10;index++) {
    if(index>0) {
      await evaluate('document.querySelector(".choice").click()');
      await waitFor('!document.getElementById("answer-feedback").hidden');
    }
    if(index<9) {
      await evaluate('document.getElementById("next").click()');
      await waitFor(`document.getElementById("progress").textContent.includes("Question ${index+2} of 10")`);
    } else {
      await evaluate('document.getElementById("submit-exam").click()');
      await waitFor('document.getElementById("results").textContent.includes("Device-only practice result")');
    }
  }
  assert.equal(await evaluate('(async()=> (await window.MinaOffline.listOfflineExamResults()).length)()'),1,"offline exam result persisted");
  assert.equal(await evaluate('(async()=> (await window.MinaOffline.listOfflineDownloads()).some(item=>item.type==="question-set"))()'),true);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,"offline exam results fit Android width");
  await setOffline(false);
  await navigate(examUrl,'document.getElementById("mode")');
  await evaluate('document.getElementById("mode").value="entrance";document.getElementById("mode").dispatchEvent(new Event("change"))');
  await waitFor('document.getElementById("bank-status").textContent.includes("reviewed questions available")');
  await evaluate('document.getElementById("download-offline").click()');
  await waitFor('document.getElementById("offline-download-status").textContent.includes("60 reviewed questions saved")');
  const entranceUrl=await evaluate("location.pathname+location.search");
  await setOffline(true);
  await navigate(entranceUrl,'document.getElementById("start-exam").disabled===false && document.getElementById("bank-status").textContent.includes("Offline:")');
  await evaluate("window.confirm=()=>true");
  await evaluate('document.getElementById("start-exam").click()');
  await waitFor('!document.getElementById("exam-time-meta").hidden && document.getElementById("exam-timer").textContent.length>0');
  const timerBefore=Number(await evaluate('document.getElementById("timer").textContent'));
  await new Promise(resolve=>setTimeout(resolve,1200));
  const timerAfter=Number(await evaluate('document.getElementById("timer").textContent'));
  assert.ok(timerAfter<timerBefore,"offline entrance practice timer counts down");
  await evaluate('document.querySelector(".choice").click();document.getElementById("next").click()');
  await waitFor('document.getElementById("progress").textContent.includes("Question 2 of 60")');
  await command("Page.reload");
  await waitFor('document.getElementById("exam") && !document.getElementById("exam").hidden && document.getElementById("progress").textContent.includes("Question 2 of 60")');
  assert.equal(await evaluate('Number(document.getElementById("timer").textContent)>0'),true,"unfinished timed entrance exam resumes offline");
  await setOffline(false);
  await navigate("/learning/?grade=9&language=en",'document.getElementById("coverage-status").textContent.includes("available lessons")');
  assert.match(await evaluate('document.getElementById("quiz-progress").textContent'),/Downloaded reviewed offline practice/);
  await setOffline(true);
  await navigate("/assistant/",'document.getElementById("messageInput") && document.getElementById("statusBanner").dataset.visible==="true"');
  assert.match(await evaluate('document.getElementById("statusBanner").textContent'),/AI Tutor works online only/);
  await evaluate('document.getElementById("messageInput").value="Offline tutor availability check";document.getElementById("messageInput").dispatchEvent(new Event("input",{bubbles:true}));document.getElementById("sendButton").click()');
  await waitFor('document.querySelector(".error-card")');
  assert.match(await evaluate('document.querySelector(".error-card").textContent'),/No on-device AI model is installed/);
  assert.match(await evaluate('document.getElementById("conversationScroll").textContent'),/Offline tutor availability check/);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,"offline tutor state fits Android width");
  await command("Emulation.setDeviceMetricsOverride",{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,"learning dashboard fits desktop width");
  assert.deepEqual(browser.exceptions,[],"offline journeys have no uncaught browser errors");
  console.log("PASS: service-worker shell, IndexedDB lesson/progress/question/result/bookmark storage, offline lesson/practice, saved timed entrance draft, explicit offline-AI limitation, Android and desktop layouts.");
} finally {
  await command("Network.emulateNetworkConditions",{offline:false,latency:0,downloadThroughput:10_000_000,uploadThroughput:10_000_000}).catch(()=>{});
  await browser.close();
}
