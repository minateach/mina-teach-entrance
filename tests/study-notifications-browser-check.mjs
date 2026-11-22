import assert from "node:assert/strict";
import {browserDriver} from "./browser-driver.mjs";

if(!process.env.REPLIT_DEV_DOMAIN)throw new Error("REPLIT_DEV_DOMAIN is required.");
const origin=`https://${process.env.REPLIT_DEV_DOMAIN}`;
const browser=await browserDriver();
const {command,evaluate,waitFor}=browser;
let savedPreferences={
  dailyReminderEnabled:false,dailyReminderTime:"18:00",
  contentNoticesEnabled:false,contentNoticesSince:null,contentCursor:null,
};
const writes=[],eventPolls=[];
let preferenceReads=0;
const firstEvent={
  eventKey:"lesson:fixture-1:2026-11-22T10:00:00.000000Z",
  type:"lesson",grade:10,subject:"History",chapter:"Unit 1",
  title:"New published History lesson",publishedAt:"2026-11-22T10:00:00.000000Z",
  url:"/learning/?grade=10&stream=social&subject=History",
};
let eventBatches=[[firstEvent]];
const event=(index)=>({
  eventKey:`exam:fixture-${index}:2026-11-22T11:00:00.00000${index}Z`,
  type:"exam",grade:9,subject:"English",chapter:"",
  title:`New reviewed practice set ${index}`,publishedAt:`2026-11-22T11:00:00.00000${index}Z`,
  url:"/exams/?grade=9&stream=natural&subject=English",
});

try {
  await command("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await command("Page.addScriptToEvaluateOnNewDocument",{source:`
    window.__permissionCalls=0;
    window.__shownNotifications=[];
    window.__notificationPermission=sessionStorage.getItem("study-notification-test-permission")||"default";
    class FakeNotification {
      constructor(title,options){window.__shownNotifications.push({title,options});}
      static get permission(){return window.__notificationPermission;}
      static requestPermission(){
        window.__permissionCalls++;
        window.__notificationPermission="denied";
        sessionStorage.setItem("study-notification-test-permission","denied");
        return Promise.resolve("denied");
      }
    }
    Object.defineProperty(window,"Notification",{value:FakeNotification,configurable:true});
    try{Object.defineProperty(navigator.serviceWorker,"getRegistration",{value:async()=>null,configurable:true});}catch{}
  `});
  await browser.intercept(request=>{
    const url=new URL(request.url),path=url.pathname,method=request.method;
    if(path==="/api/account/status")return {body:{signedIn:true,userId:"notification-test-user"}};
    if(path==="/api/account/data"&&method==="GET")return {body:{records:{learning:{}}}};
    if(path==="/api/account/data/learning"||path==="/api/account/data/learning/offline-results")return {body:{saved:true}};
    if(path==="/api/exams/history")return {body:{attempts:[],topicOutcomes:[]}};
    if(path==="/api/learning/catalog")return {body:{grade:10,language:"en",subjects:[]}};
    if(path==="/api/learning/lessons")return {body:{lessons:[],nextOffset:null}};
    if(path==="/api/study-notifications/preferences"&&method==="GET")
      {preferenceReads++;return {body:{notifications:savedPreferences}};}
    if(path==="/api/study-notifications/preferences"&&method==="PUT") {
      const input=JSON.parse(request.postData||"{}");
      writes.push(input);
      const enabledAt=input.contentNoticesEnabled&&!savedPreferences.contentNoticesEnabled
        ?new Date().toISOString():input.contentNoticesEnabled?savedPreferences.contentNoticesSince:null;
      savedPreferences={...savedPreferences,...input,
        contentNoticesSince:enabledAt,
        contentCursor:input.contentNoticesEnabled&&savedPreferences.contentNoticesEnabled?savedPreferences.contentCursor:null};
      return {body:{saved:true,notifications:savedPreferences}};
    }
    if(path==="/api/study-notifications/events") {
      eventPolls.push(Date.now());
      return {body:{events:eventBatches.shift()||[],limit:20}};
    }
    return null;
  },["*api/*"]);

  async function waitNode(test,label) {
    const deadline=Date.now()+15000;
    while(Date.now()<deadline){if(test())return;await new Promise(resolve=>setTimeout(resolve,50));}
    throw new Error(`Timed out waiting for ${label}`);
  }
  const path="/learning/?grade=10&language=en";
  await command("Page.navigate",{url:origin+path});
  await waitFor(`location.href===${JSON.stringify(origin+path)} && document.getElementById("notification-permission")`);
  await waitNode(()=>preferenceReads>0,"account notification preferences to load");
  await waitFor('document.getElementById("notifications-status").textContent.includes("loaded from your account")');
  await waitFor('document.getElementById("daily-reminder-time").disabled');
  assert.equal(eventPolls.length,0,"new-content polling stays off until explicit opt-in");
  assert.equal(await evaluate("window.__permissionCalls"),0,"permission is never requested on page load");
  assert.equal(await evaluate('document.getElementById("content-notices-enabled").disabled'),false);
  assert.equal(await evaluate('document.getElementById("notification-permission").disabled'),false,"supported browser offers an explicit permission action");
  assert.match(await evaluate('document.querySelector(".notification-limit-note").textContent'),/background push is not configured/);
  const reminderWindow=await evaluate(`(async()=>{
    const {dailyReminderDue}=await import("/learning/study-notifications.js");
    return [
      dailyReminderDue("09:15",new Date(2026,10,22,9,17,30),null),
      dailyReminderDue("09:15",new Date(2026,10,22,9,17,30),"2026-11-22"),
      dailyReminderDue("09:15",new Date(2026,10,22,9,21,0),null)
    ];
  })()`);
  assert.deepEqual(reminderWindow,[true,false,false],"reminders fire at most once and only within the local five-minute window");

  await evaluate('document.getElementById("daily-reminder-enabled").click()');
  await waitFor('document.getElementById("daily-reminder-time").disabled===false && document.getElementById("daily-reminder-status").textContent.includes("Daily reminder set")');
  await evaluate('document.getElementById("daily-reminder-time").value="09:15";document.getElementById("daily-reminder-time").dispatchEvent(new Event("change",{bubbles:true}))');
  await waitFor('document.getElementById("daily-reminder-time").value==="09:15"');
  await waitFor('window.__notificationTestSaved===true || document.getElementById("notifications-status").textContent.includes("saved to your account")');
  assert.equal(savedPreferences.dailyReminderEnabled,true,"daily reminder opt-in is persisted");
  assert.equal(savedPreferences.dailyReminderTime,"09:15","student can change reminder time");

  await evaluate('document.getElementById("notification-permission").click()');
  await waitFor('window.__permissionCalls===1 && document.getElementById("notifications-status").textContent.includes("denied")');
  assert.equal(await evaluate("window.__shownNotifications.length"),0,"denied permission prevents system alerts");

  await evaluate('document.getElementById("content-notices-enabled").click()');
  await waitFor('document.getElementById("content-notice-list").textContent.includes("New published History lesson")');
  assert.equal(savedPreferences.contentNoticesEnabled,true,"content notices are saved only after opt-in");
  assert.ok(savedPreferences.contentNoticesSince,"content notice opt-in establishes a new-content baseline");
  assert.match(await evaluate('document.getElementById("content-notice-list").querySelector("a").href'),/\/learning\//,"lesson notice links to the actual learning route");
  assert.equal(eventPolls.length,1,"content events are checked only after opt-in");

  eventBatches=[[event(1),event(2),event(3),event(4),event(5)]];
  await evaluate(`window.__notificationPermission="granted";
    sessionStorage.setItem("study-notification-test-permission","granted");
    Object.defineProperty(navigator.serviceWorker,"getRegistration",{value:async()=>({
      showNotification:async(title,options)=>window.__shownNotifications.push({title,options}),
    }),configurable:true});
    window.dispatchEvent(new Event("online"))`);
  await waitFor('document.getElementById("content-notice-list").textContent.includes("New reviewed practice set 5")');
  assert.equal(await evaluate("window.__shownNotifications.length"),3,"one poll sends no more than three system notices");
  assert.equal(await evaluate('window.__shownNotifications.every(item=>item.options.data.url.startsWith("/exams/"))'),true,"system notices carry safe in-app destinations");
  assert.equal(await evaluate('document.getElementById("content-notice-list").querySelectorAll("li").length'),6,"all returned notices remain available in the in-app list");

  eventBatches=[[event(1),event(2),event(3),event(4),event(5)]];
  await evaluate('window.dispatchEvent(new Event("online"))');
  await waitNode(()=>eventPolls.length>=3,"the duplicate-content poll");
  assert.equal(await evaluate("window.__shownNotifications.length"),3,"repeated event IDs do not send duplicate system notices");
  assert.equal(await evaluate('document.getElementById("content-notice-list").querySelectorAll("li").length'),6,"repeated event IDs do not duplicate the in-app feed");

  const pollCount=eventPolls.length;
  await evaluate('document.getElementById("content-notices-enabled").click()');
  await waitFor('document.getElementById("content-notices-enabled").checked===false && document.getElementById("notifications-status").textContent.includes("saved to your account")');
  assert.equal(savedPreferences.contentNoticesEnabled,false,"student can turn content notices off");
  await evaluate('window.dispatchEvent(new Event("online"))');
  await new Promise(resolve=>setTimeout(resolve,150));
  assert.equal(eventPolls.length,pollCount,"disabled content notices stop event polling");
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,"notification controls fit an Android-sized viewport");
  assert.deepEqual(browser.exceptions,[],"notification page has no browser exceptions");

  console.log("PASS: opt-in permission prompt, denied-permission fallback, per-account reminder preferences, local reminder time, real-content notice flow fixtures, duplicate suppression, three-alert delivery cap, disable behavior, and Android-sized layout.");
  console.log("SCOPE: browser notification and content-event endpoints were exercised with browser-only fixtures; live signed-in account delivery and closed-app push are not claimed.");
} finally {
  await browser.stopIntercept().catch(()=>{});
  await browser.close();
}
