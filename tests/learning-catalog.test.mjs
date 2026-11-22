import test from "node:test";
import assert from "node:assert/strict";
import {createLearningCatalog,validateScope,subjects,LearningInputError} from "../server/learning-catalog.mjs";
import {allPrimaryCurriculumSources,curriculumSourceFor} from "../server/curriculum-sources.mjs";

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
test("the 36-course source map distinguishes textbook outlines, partial sets, teacher guides, and missing sources",async()=>{
  const mappings=allPrimaryCurriculumSources();
  assert.equal(mappings.length,36);
  assert.equal(new Set(mappings.map(item=>`${item.grade}:${item.subject}`)).size,36);
  assert.equal(mappings.filter(item=>item.source).length,7);
  assert.equal(mappings.filter(item=>item.status==="source_required").length,29);
  assert.equal(curriculumSourceFor(9,"Mathematics").units.length,7);
  assert.deepEqual(curriculumSourceFor(10,"History").units.map(unit=>unit.number),[1]);
  assert.equal(curriculumSourceFor(10,"Geography").status,"teacher_guide_only");
  assert.equal(curriculumSourceFor(11,"Civics").status,"source_required");
  assert.ok(mappings.every(item=>item.curriculumCompletenessVerified===false));
  const audit=await createLearningCatalog(emptyPool).audit({language:"en"});
  const primary=audit.courses.filter(course=>course.primary);
  assert.equal(primary.length,36);
  assert.ok(primary.every(course=>course.curriculumSource && course.sourceCoverage===course.curriculumSource.summary));
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
  assert.deepEqual(course.chapters[0].lessons[0].topicOutline,lesson.topics.map((topic,index)=>({id:String(index),title:topic.title})));
  assert.equal(course.chapters.flatMap(chapter=>chapter.lessons).reduce((count,lesson)=>count+lesson.topicOutline.length,0),19);
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
test("practice summaries distinguish generated lesson questions from eligible reviewed bank counts",async()=>{
  const pool={query:async(sql,params)=>{
    assert.deepEqual(params,[10]);
    if(sql.includes("mina_questions")) {
      assert.match(sql,/review_status='approved'/);
      assert.match(sql,/source_kind<>'ai_generated'/);
      return {rows:[{subject:"English",stream:"common",count:60},{subject:"History",stream:"social",count:12},{subject:"Afaan Oromoo",stream:"social",count:5}]};
    }
    return {rows:[]};
  }};
  // Summary metadata uses grade and language; the grouped exam count uses grade only.
  const api=createLearningCatalog({query:async(sql,params)=>sql.includes("mina_questions")?pool.query(sql,params):({rows:[]})});
  const catalog=await api.catalog({grade:10});
  const history=catalog.subjects.find(subject=>subject.name==="History");
  assert.equal(history.practiceLessonId,"history10-1.1");
  assert.equal(history.practiceQuestionCount,60);
  assert.equal(history.reviewedQuestionCount,12);
  assert.equal(history.practiceStream,"social");
  assert.equal(history.availableTopicKeys.length,19);
  assert.equal(new Set(history.availableTopicKeys).size,19);
  const english=catalog.subjects.find(subject=>subject.name==="English");
  assert.equal(english.reviewedQuestionCount,60);
  assert.equal(english.lessonCount,0,"questions do not manufacture published lessons");
  assert.equal(english.practiceLessonId,null);
  assert.equal(catalog.subjects.find(subject=>subject.name==="Afaan Oromoo").practiceStream,"social");
});
