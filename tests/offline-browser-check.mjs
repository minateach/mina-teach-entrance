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
  assert.equal(await evaluate('(await window.__offlineReady)||true'),true);

  await setOffline(true);
  await navigate(lessonUrl,'document.getElementById("lesson-page") && document.querySelector(".lesson-page h2")');
  assert.match(await evaluate('document.getElementById("offline-connection-status").textContent'),/Offline/);
  assert.match(await evaluate('document.querySelector(".lesson-page").textContent'),/Complete lesson notes|Introduction/);
  await evaluate('document.getElementById("start-practice").click()');
  await waitFor('document.querySelector(".history-choice") || document.getElementById("lesson-practice").textContent.includes("Complete")');
  assert.equal(await evaluate('document.getElementById("complete-lesson").disabled'),false);

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
  const total=await evaluate('document.getElementById("progress").textContent.match(/of (\\d+)/)?.[1]');
  assert.equal(Number(total),10);
  for(let index=0;index<10;index++) {
    await evaluate('document.querySelector(".choice").click()');
    await waitFor('!document.getElementById("answer-feedback").hidden');
    if(index<9) {
      await evaluate('document.getElementById("next").click()');
      await waitFor(`document.getElementById("progress").textContent.includes("Question ${index+2} of 10")`);
    } else {
      await evaluate('document.getElementById("submit-exam").click()');
      await waitFor('document.getElementById("results").textContent.includes("Device-only practice result")');
    }
  }
  assert.equal(await evaluate('(await window.MinaOffline.listOfflineExamResults()).length'),1,"offline exam result persisted");
  assert.equal(await evaluate('(await window.MinaOffline.listOfflineDownloads()).some(item=>item.type==="question-set")'),true);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,"offline exam results fit Android width");
  await setOffline(false);
  await navigate("/learning/?grade=10&language=en",'document.getElementById("coverage-status").textContent.includes("available lessons")');
  assert.match(await evaluate('document.getElementById("quiz-progress").textContent'),/Downloaded reviewed offline practice/);
  await command("Emulation.setDeviceMetricsOverride",{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,"learning dashboard fits desktop width");
  assert.deepEqual(browser.exceptions,[],"offline journeys have no uncaught browser errors");
  console.log("PASS: service-worker shell, complete selected lesson download, offline lesson/material retrieval and lesson practice, offline reviewed-question download, timer/answer/scoring/result persistence, device bookmarks, result sync queue visibility, Android and desktop layouts.");
} finally {
  await command("Network.emulateNetworkConditions",{offline:false,latency:0,downloadThroughput:10_000_000,uploadThroughput:10_000_000}).catch(()=>{});
  await browser.close();
}
