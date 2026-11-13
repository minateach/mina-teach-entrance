import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const stateSource=readFileSync(new URL("../learning/learning-state.js",import.meta.url),"utf8");
const stateUrl=`data:text/javascript;base64,${Buffer.from(stateSource).toString("base64")}`;
const materialSource=readFileSync(new URL("../learning/material-reader.js",import.meta.url),"utf8").replace('"./learning-state.js"',JSON.stringify(stateUrl));
const materialUrl=`data:text/javascript;base64,${Buffer.from(materialSource).toString("base64")}`;
const viewSource=readFileSync(new URL("../learning/lesson-view.js",import.meta.url),"utf8").replace('"./learning-state.js"',JSON.stringify(stateUrl)).replace('"./material-reader.js"',JSON.stringify(materialUrl));
const {practiceUrl,topicParams}=await import(`data:text/javascript;base64,${Buffer.from(viewSource).toString("base64")}`);

test("practice links use the subject or actual available bank stream, not an unrelated dashboard preference",()=>{
  for(const subject of ["History","Geography","Economics","Civics and Ethics"]) {
    const url=new URL(practiceUrl({grade:10,subject,stream:"natural"}),"https://test.invalid");
    assert.equal(url.searchParams.get("stream"),"social");
    assert.equal(url.searchParams.get("subject"),subject);
    assert.equal(url.searchParams.get("grade"),"10");
  }
  assert.equal(new URL(practiceUrl({grade:12,subject:"Mathematics",stream:"social"}),"https://test.invalid").searchParams.get("stream"),"natural");
  assert.equal(new URL(practiceUrl({grade:9,subject:"English",practiceStream:"social"}),"https://test.invalid").searchParams.get("stream"),"social");
  assert.equal(new URL(practiceUrl({grade:9,subject:"English"},{topic:"2. Writing"}),"https://test.invalid").searchParams.get("topic"),"2. Writing");
});

test("home Start Learning and all nine requested subject cards link to learning routes",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  assert.match(html,/<a href="\/learning\/" class="btn">Start Learning/);
  const cards=[...html.matchAll(/<a class="card" href="([^"]+)"/g)].map(match=>new URL(match[1].replaceAll("&amp;","&"),"https://test.invalid"));
  for(const subject of ["Mathematics","Physics","Chemistry","Biology","English","Geography","History","Economics","Civics"]) {
    assert.ok(cards.some(url=>url.pathname==="/learning/" && url.searchParams.get("subject")===subject && url.searchParams.get("grade")==="9"),subject);
  }
  assert.ok(cards.some(url=>url.searchParams.get("subject")==="Aptitude"),"existing extra subjects remain accessible");
});
test("saved topics reopen with old numeric IDs and stable string IDs",()=>{
  assert.deepEqual(topicParams(0),{topic:"0"});
  assert.deepEqual(topicParams("0"),{topic:"0"});
  assert.deepEqual(topicParams("mechanics-part-2"),{topic:"mechanics-part-2"});
  assert.deepEqual(topicParams(undefined),{});
  assert.deepEqual(topicParams("../../not-a-topic"),{});
});
test("practice preserves a local return route to the exact subject or lesson",()=>{
  const course={grade:10,subject:"History",language:"om"};
  const subject=new URL(practiceUrl(course),"https://test.invalid");
  assert.equal(subject.searchParams.get("returnTo"),"/learning/?grade=10&subject=History&language=om");
  const lesson=new URL(practiceUrl({...course,id:"history10-1.1"},{returnTo:"/learning/?grade=10&subject=History&language=en&lesson=history10-1.1&topic=2"}),"https://test.invalid");
  assert.match(lesson.searchParams.get("returnTo"),/lesson=history10-1.1&topic=2$/);
});
