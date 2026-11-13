import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../learning/learning-state.js",import.meta.url),"utf8");
const {normalizeState,mergeLearning,createStore,STORAGE_KEY,topicIsComplete}=await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
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
