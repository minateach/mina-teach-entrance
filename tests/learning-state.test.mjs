import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../learning/learning-state.js",import.meta.url),"utf8")
  .replace('import {cachedApiResponse,getOfflineLearningState,getOfflineOwner,listOfflineExamResults,saveOfflineLearningState,setOfflineOwner} from "./offline-store.js";',
    'const cachedApiResponse=async()=>null;const getOfflineLearningState=async()=>null;const getOfflineOwner=()=>globalThis.__offlineOwner||"guest";const saveOfflineLearningState=async()=>({});const setOfflineOwner=owner=>(globalThis.__offlineOwner=owner);const listOfflineExamResults=async()=>[];');
const {normalizeState,mergeLearning,createStore,STORAGE_KEY,topicIsComplete,practiceContentVersion,validPracticeDraft}=await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
function storage() {
  const entries=new Map();
  return {getItem:key=>entries.get(key)||null,setItem:(key,value)=>entries.set(key,value),entries};
}
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
test("malformed/legacy state is normalized without deleting preserved data",()=>{
  assert.deepEqual(normalizeState(null).completed,[]);
  assert.deepEqual(normalizeState({completed:["real",null,"real"],tasks:[{text:"keep me"},null]}).completed,["real"]);
  assert.equal(normalizeState({unknownFeature:{keep:true}}).unknownFeature.keep,true);
});
test("pending merges preserve actual progress and honor removed saved lessons",()=>{
  const merged=mergeLearning({completed:["remote"],saved:[{key:"remove"},{key:"keep"}],tasks:[{text:"remote"}]},
    {completed:["local"],removedSaved:["remove"],tasks:[{text:"local"}],_pendingSync:true});
  assert.deepEqual(merged.completed,["remote","local"]);
  assert.deepEqual(merged.saved.map(item=>item.key),["keep"]);
  assert.deepEqual(merged.tasks.map(task=>task.text),["remote","local"]);
  assert.deepEqual(mergeLearning({tasks:[{text:"remove"}]},{removedTasks:["legacy:remove"]}).tasks,[]);
});
test("guest completion, tasks, saves and bookmarks survive reload; write failures are explicit",async()=>{
  globalThis.localStorage=storage();globalThis.fetch=async()=>response({signedIn:false});
  const statuses=[];const store=createStore(text=>statuses.push(text));await store.initialize();
  store.state.completed.push("real");store.state.tasks.push({text:"Keep task"});store.toggle("saved",{key:"real",title:"Actual lesson"});store.toggle("bookmarks",{key:"real:topic:0"});
  const restored=createStore();await restored.initialize();
  assert.deepEqual(restored.state.completed,["real"]);assert.equal(restored.state.saved.length,1);assert.equal(restored.state.bookmarks.length,1);assert.equal(restored.state.tasks.length,1);
  localStorage.setItem=()=>{throw new Error("quota");};assert.equal(store.save(),false);assert.match(statuses.at(-1),/storage is unavailable or full/);
});
test("private account state never automatically imports guest/another account's data",async()=>{
  globalThis.localStorage=storage();
  localStorage.setItem(STORAGE_KEY,JSON.stringify({completed:["guest-only"]}));
  let user="user_A";const writes=[];
  globalThis.fetch=async(url,options={})=>{
    if(url==="/api/account/status")return response({signedIn:true,userId:user});
    if(options.method==="PUT"){writes.push(JSON.parse(options.body));return response({saved:true});}
    return response({records:{learning:{completed:[`${user}-remote`]}}});
  };
  const a=createStore();await a.initialize();assert.deepEqual(a.state.completed,["user_A-remote"]);
  a.state.completed.push("A-private");a.save();await a.retry();
  assert.equal(writes[0].expectedUserId,"user_A");
  user="user_B";const b=createStore();await b.initialize();
  assert.deepEqual(b.state.completed,["user_B-remote"]);
  assert.deepEqual(JSON.parse(localStorage.getItem(STORAGE_KEY)).completed,["guest-only"]);
});
test("a failed account read cannot overwrite the server; retry restores pending changes",async()=>{
  globalThis.localStorage=storage();let failRead=true;const writes=[];const statuses=[];
  globalThis.fetch=async(url,options={})=>{
    if(url==="/api/account/status")return response({signedIn:true,userId:"user_A"});
    if(options.method==="PUT"){writes.push(JSON.parse(options.body));return response({saved:true});}
    return failRead?response({error:{message:"Account read unavailable"}},503):response({records:{learning:{completed:["remote"],tasks:[{text:"Preserve the remote planner"}]}}});
  };
  const store=createStore(text=>statuses.push(text));await store.initialize();
  store.state.completed.push("offline");store.save();assert.equal(writes.length,0);assert.match(statuses[0] || statuses.at(-1),/unavailable/);
  failRead=false;await store.retry();
  assert.equal(writes.length,1);assert.deepEqual(writes[0].data.completed,["remote","offline"]);
  assert.equal(writes[0].data.tasks[0].text,"Preserve the remote planner");
});
test("cloud failures leave a visible error and pending local copy",async()=>{
  globalThis.localStorage=storage();const statuses=[];
  globalThis.fetch=async(url,options={})=>{
    if(url==="/api/account/status")return response({signedIn:true,userId:"user_A"});
    if(options.method==="PUT")return response({error:{message:"Session expired"}},401);
    return response({records:{}});
  };
  const store=createStore(text=>statuses.push(text));await store.initialize();
  store.state.completed.push("real");store.save();await store.retry();
  assert.match(statuses.at(-1),/Session expired.*Retry sync/);
  assert.equal(JSON.parse(localStorage.getItem(`${STORAGE_KEY}:account:user_A`))._pendingSync,true);
});
test("topic progress is normalized, merged, and restored without marking a whole lesson complete",async()=>{
  const merged=mergeLearning({completedTopics:["lesson:1:topic:0"]},{completedTopics:["lesson:1:topic:1","lesson:1:topic:1",null]});
  assert.deepEqual(merged.completedTopics,["lesson:1:topic:0","lesson:1:topic:1"]);
  assert.equal(topicIsComplete(merged,"lesson:1:topic:0"),true);
  assert.equal(topicIsComplete(merged,"lesson:1:topic:2"),false);
  assert.deepEqual(merged.completed,[]);
  merged.completed.push("lesson:1");
  assert.equal(topicIsComplete(merged,"lesson:1:topic:2"),true);
  globalThis.localStorage=storage();globalThis.fetch=async()=>response({signedIn:false});
  const store=createStore();await store.initialize();
  store.state.completedTopics.push("lesson:2:topic:0");store.save();
  const restored=createStore();await restored.initialize();
  assert.equal(topicIsComplete(restored.state,"lesson:2:topic:0"),true);
});
const lesson={id:"lesson-test",grade:10,subject:"History",language:"en",
  questions:[{prompt:"One?",choices:["A","B","C","D"],answer:1,explanation:"Because B."},
    {prompt:"Two?",choices:["A","B","C","D"],answer:2,explanation:"Because C."}]};
const draft=()=>({version:1,id:"stable-attempt",contentVersion:practiceContentVersion(lesson),index:1,answers:[0,2]});
test("lesson drafts require exact content and valid sequential answers/position",()=>{
  assert.equal(validPracticeDraft(draft(),lesson),true);
  for(const patch of [{version:2},{id:null},{index:2},{index:-1},{answers:[null,1]},{answers:[0,4]},{answers:[0]},{answers:["0",null]}])
    assert.equal(validPracticeDraft({...draft(),...patch},lesson),false);
  for(const field of ["prompt","choices","answer","explanation"]) {
    const changed=structuredClone(lesson);
    changed.questions[0][field]=field==="choices"?["B","A","C","D"]:field==="answer"?0:"Changed";
    assert.equal(validPracticeDraft(draft(),changed),false,field);
  }
});
test("drafts stay on one device and account, survive sync, and never enter cloud payloads",async()=>{
  const device=storage();globalThis.localStorage=device;
  let user=null;const writes=[];
  globalThis.fetch=async(url,options={})=>{
    if(url==="/api/account/status")return response({signedIn:!!user,userId:user});
    if(options.method==="PUT"){writes.push(JSON.parse(options.body));return response({saved:true});}
    return response({records:{learning:{_lessonPracticeDrafts:{"lesson-test":draft()},completed:["remote"]}}});
  };
  const guest=createStore();await guest.initialize();guest.writePracticeDraft(lesson.id,draft());
  user="A";const a=createStore();await a.initialize();
  assert.equal(a.readPracticeDraft(lesson.id),null,"ignore remote and guest drafts");
  a.writePracticeDraft(lesson.id,draft());a.save();await a.retry();
  assert.equal(writes[0].data._lessonPracticeDrafts,undefined);
  const restored=createStore();await restored.initialize();assert.deepEqual(restored.readPracticeDraft(lesson.id),draft());
  assert.equal(restored.readPracticeDraft("different-lesson"),null);
  user="B";const b=createStore();await b.initialize();assert.equal(b.readPracticeDraft(lesson.id),null);
  await assert.rejects(a.confirmPracticeIdentity(),/account changed/);
  user=null;const signedOut=createStore();await signedOut.initialize();assert.deepEqual(signedOut.readPracticeDraft(lesson.id),draft());
  globalThis.localStorage=storage();const otherDevice=createStore();await otherDevice.initialize();assert.equal(otherDevice.readPracticeDraft(lesson.id),null);
  globalThis.localStorage=device;
});
test("completion removes draft and records one result per stable attempt, including stale views",async()=>{
  globalThis.localStorage=storage();globalThis.fetch=async()=>response({signedIn:false});
  const first=createStore();await first.initialize();first.writePracticeDraft(lesson.id,draft());
  const stale=createStore();await stale.initialize();
  const result={id:draft().id,score:1,total:2,completedAt:new Date().toISOString()};
  first.writePracticeDraft(lesson.id,null,result);
  stale.writePracticeDraft(lesson.id,null,result);
  assert.equal(stale.readPracticeDraft(lesson.id),null);
  assert.equal(stale.state.practice.length,1);
  const restored=createStore();await restored.initialize();assert.equal(restored.state.practice.length,1);
  restored.writePracticeDraft(lesson.id,null,{...result,id:"intentional-retry"});
  assert.equal(restored.state.practice.length,2,"intentional retries remain distinct");
  localStorage.setItem=()=>{throw new Error("quota");};
  assert.throws(()=>restored.writePracticeDraft(lesson.id,draft()),/could not be saved/);
});
