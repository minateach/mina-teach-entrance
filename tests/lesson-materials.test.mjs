import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import pg from "pg";
import {materialFixtures} from "./material-fixtures.mjs";
import {materialProblem,materialsProblem,auditLessonTopics} from "../server/lesson-materials.mjs";
import {createLearningCatalog,databaseSummary} from "../server/learning-catalog.mjs";
import {historyAnswers} from "../server/history-grade10-answers.mjs";
import history from "../learning/history-grade10.js";

const state=readFileSync(new URL("../learning/learning-state.js",import.meta.url),"utf8")
  .replace('import {cachedApiResponse,getOfflineLearningState,getOfflineOwner,listOfflineExamResults,saveOfflineLearningState,setOfflineOwner} from "./offline-store.js";',
    'const cachedApiResponse=async()=>null;const getOfflineLearningState=async()=>null;const getOfflineOwner=()=>"guest";const saveOfflineLearningState=async()=>({});const setOfflineOwner=()=>{};const listOfflineExamResults=async()=>[];');
const stateUrl=`data:text/javascript;base64,${Buffer.from(state).toString("base64")}`;
const reader=readFileSync(new URL("../learning/material-reader.js",import.meta.url),"utf8").replace('"./learning-state.js"',JSON.stringify(stateUrl));
const {textParts}=await import(`data:text/javascript;base64,${Buffer.from(reader).toString("base64")}`);

test("all sixteen material types preserve full content and source provenance",()=>{
  const materials=materialFixtures(),before=JSON.stringify(materials);
  assert.equal(materialsProblem(materials),null);
  assert.equal(JSON.stringify(materials),before);
  assert.equal(materials.length,16);
  assert.ok(materials[0].text.length>20000);
  assert.match(materialProblem({...materials[0],unsupportedField:"must not disappear"}),/Unrecognized/);
  assert.match(materialProblem({...materials[8],rows:[["missing column"]]}),/complete rows/);
  assert.match(materialProblem({...materials[13],choices:["A","B"]}),/four choices/);
  assert.match(materialProblem({...materials[6],url:"javascript:alert(1)"}),/safe|HTTPS/);
  assert.match(materialProblem({...materials[4],items:[]}),/Objectives require/);
  assert.match(materialProblem({...materials[12],text:"",items:[]}),/Summaries require/);
  assert.match(materialsProblem([materials[0],materials[0]]),/Duplicate/);
});
test("numbered text sections reassemble exactly, including whitespace, Oromo, Amharic and Unicode boundary characters",()=>{
  const text=" \nAfaan Oromoo · አማርኛ · English "+("x".repeat(11999)+"😀\n").repeat(7)+"LAST-CHARACTERS  \n";
  const parts=textParts(text);
  assert.ok(parts.length>1);assert.equal(parts.join(""),text);
  assert.ok(parts.every(part=>!(/[\uD800-\uDBFF]$/.test(part))));
  assert.match(parts.at(-1),/LAST-CHARACTERS  \n$/);
});
test("content revisions retain stable lesson IDs but cannot inherit completion of newly added material",()=>{
  const row={id:42,grade:9,subject:"English",chapter:"1. Reading",material_outline:[{id:"a",topicId:"reading"}]};
  const first=databaseSummary({...row,content_version:1}),next=databaseSummary({...row,content_version:2});
  assert.equal(first.id,next.id);assert.notEqual(first.key,next.key);
  assert.ok(next.topicKeys.includes("lesson:42:v2:topic:reading"));
});
test("every existing History exercise and revision question now has an original worked response",()=>{
  for(const lesson of history.completeLessons) {
    const answers=historyAnswers[lesson.number];
    assert.equal(answers.exerciseAnswers.length,lesson.exercises.length);
    assert.equal(answers.revisionAnswers.length,lesson.revision.length);
    assert.ok([...answers.exerciseAnswers,...answers.revisionAnswers].every(answer=>answer.length>=100));
  }
});
test("the audit names missing material and never certifies full curriculum coverage from a title",()=>{
  const [audit]=auditLessonTopics({id:"fixture",title:"Fixture",content:"",exercises:["Needs an answer"],revision:["Needs a response"]});
  assert.equal(audit.curriculumCompletenessVerified,false);
  assert.ok(audit.missing.some(gap=>gap.includes("explanation")));
  assert.ok(audit.missing.some(gap=>gap.includes("exercise")));
});
test("PostgreSQL stores long notes unchanged and returns every material through all paginated reads", {skip:!process.env.DATABASE_URL},async()=>{
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL}),client=await pool.connect();
  try {
    await client.query("BEGIN");
    const content=" \n"+"Uncommitted technical fixture. ".repeat(1400)+" FINAL-NOTES-MARKER \n";
    const materials=materialFixtures();
    const result=await client.query(`INSERT INTO mina_learning_lessons
      (grade,stream,subject,chapter,title,language,content,source_label,review_status,materials)
      VALUES (9,'common','Mathematics',$1,'Uncommitted regression fixture','en',$2,'Technical fixture, not curriculum content','published',$3::jsonb) RETURNING id`,
      [`Technical check ${crypto.randomUUID()}`,content,JSON.stringify(materials)]);
    const id=`db-${result.rows[0].id}`,api=createLearningCatalog(client);
    const lesson=await api.lesson(id);
    assert.equal(lesson.content,content);
    assert.equal(lesson.materialOutline.length,materials.length);
    assert.equal(lesson.topicKeys.length,2);
    assert.equal(Object.hasOwn(lesson,"materials"),false,"catalog detail returns the outline, not all large payloads");
    const recovered=[];let offset=0;
    do {
      const page=await api.materials(id,{offset,limit:3});
      assert.equal(page.total,materials.length);recovered.push(...page.materials);offset=page.nextOffset;
    }while(offset!==null);
    assert.deepEqual(recovered,materials);
    await assert.rejects(api.materials(id,{offset:-1}),/valid material page/);
    const audit=await api.audit({grade:9,subject:"Mathematics"});
    assert.ok(audit.topics.some(topic=>topic.materialSections.length===materials.length));
    await client.query("UPDATE mina_learning_lessons SET content_version=content_version+1 WHERE id=$1",[result.rows[0].id]);
    assert.notEqual((await api.lesson(id)).key,lesson.key);
  }finally {
    await client.query("ROLLBACK");client.release();await pool.end();
  }
});
