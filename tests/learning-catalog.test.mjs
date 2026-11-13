import test from "node:test";
import assert from "node:assert/strict";
import {createLearningCatalog,validateScope,subjects,LearningInputError} from "../server/learning-catalog.mjs";

const emptyPool={query:async()=>({rows:[]})};
test("all 36 requested grade/subject combinations have a valid course without fake lessons",async()=>{
  const api=createLearningCatalog(emptyPool);
  for(const grade of [9,10,11,12]) {
    const catalog=await api.catalog({grade});
    assert.ok(catalog.subjects.length>=18);
    for(const subject of subjects.slice(0,9)) {
      const course=await api.course({grade,subject,stream:"natural"});
      assert.equal(course.grade,grade);assert.equal(course.subject,subject);
      assert.equal(course.lessonCount,grade===10&&subject==="History"?6:0);
      assert.equal(catalog.subjects.find(item=>item.name===subject).lessonCount,course.lessonCount);
    }
  }
});
test("summary requests omit prose/questions; detail requests load one actual lesson",async()=>{
  const api=createLearningCatalog(emptyPool);
  const course=await api.course({grade:10,subject:"History"});
  assert.equal(course.chapters.length,1);
  assert.equal(course.chapters[0].lessons.map(item=>item.number).join(","),"1.1,1.2,1.2.1,1.2.2,1.2.3,1.2.4");
  assert.doesNotMatch(JSON.stringify(course),/"content"|"questions"|"notes"|"choices"/);
  const lesson=await api.lesson(course.chapters[0].lessons[0].id);
  assert.equal(lesson.key,"curriculum:history:10:1.1");
  assert.equal(lesson.questions.length,10);
  assert.ok(lesson.content.length>80);
  assert.equal(lesson.origin,"ai_authored");
  assert.equal((await api.course({grade:10,subject:"History",language:"am"})).lessonCount,0);
});
test("database chapter and lesson numbers sort naturally; drafts/incomplete rows are guarded in SQL",async()=>{
  const queries=[];
  const rows=[
    {id:3,grade:9,stream:"common",subject:"English",language:"en",chapter:"Chapter 10. Reading",title:"10. Practice",source_label:"Reviewed source"},
    {id:2,grade:9,stream:"common",subject:"English",language:"en",chapter:"Chapter 2. Writing",title:"10. Revise",source_label:"Reviewed source"},
    {id:1,grade:9,stream:"common",subject:"English",language:"en",chapter:"Chapter 2. Writing",title:"2. Draft",source_label:"Reviewed source"},
  ];
  const api=createLearningCatalog({query:async(sql,params)=>{
    queries.push({sql,params});
    assert.match(sql,/review_status='published'/);assert.match(sql,/length\(trim\(content\)\)>=80/);
    return {rows:sql.includes("WHERE id=$1")?[{...rows[2],content:"Actual lesson content. ".repeat(10),examples:[],key_points:[]}]:rows};
  }});
  const course=await api.course({grade:9,subject:"English"});
  assert.equal(course.chapters[0].title,"Chapter 2. Writing");
  assert.equal(course.chapters[0].lessons[0].id,"db-1");
  assert.equal(course.chapters[1].title,"Chapter 10. Reading");
  assert.ok(!queries[0].sql.includes("content,examples"));
  const detail=await api.lesson("db-1");assert.ok(detail.content);
  assert.deepEqual(queries.at(-1).params,["1"]);
});
test("invalid scopes and IDs are rejected; unavailable lessons never return empty content",async()=>{
  for(const query of [{grade:8},{grade:13},{language:"de"},{subject:"not-a-subject"},{stream:"unknown"}])assert.throws(()=>validateScope(query),LearningInputError);
  assert.equal(validateScope({subject:"Civics"}).subject,"Civics and Ethics");
  const api=createLearningCatalog(emptyPool);
  assert.equal(await api.lesson("history10-9.99"),null);
  assert.equal(await api.lesson("db-99999"),null);
  await assert.rejects(api.lesson("../server.mjs"),LearningInputError);
});
test("database failures propagate rather than returning invented empty curricula",async()=>{
  const api=createLearningCatalog({query:async()=>{throw new Error("simulated database outage");}});
  await assert.rejects(api.catalog({grade:9}),/outage/);
  await assert.rejects(api.course({grade:10,subject:"History"}),/outage/);
});
