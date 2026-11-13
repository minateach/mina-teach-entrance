import assert from "node:assert/strict";
import pg from "pg";
import history from "../learning/history-grade10.js";
import {historyAnswers} from "../server/history-grade10-answers.mjs";
const origin=process.argv[2] || (process.env.REPLIT_DEV_DOMAIN?`https://${process.env.REPLIT_DEV_DOMAIN}`:null);
if(!origin)throw new Error("Supply the running development app URL.");
if(process.env.REPLIT_DEPLOYMENT==="1")throw new Error("Use the production read-only database workflow for a published-app audit.");
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const get=async path=>{
  const response=await fetch(new URL(path,origin));
  if(!response.ok)throw new Error(`Audit request failed: ${response.status} ${path}`);
  return response.json();
};
try {
  const checked=new Set(),languages=[];let topicCount=0,materialCount=0;
  for(const language of ["en","om","am"]) {
    const overview=await get(`/api/learning/audit?language=${language}`);
    let topics=0,lessons=0;
    for(const course of overview.courses.filter(item=>item.lessons>0)) {
      let offset=0,courseTopics=0;
      do {
        const page=await get(`/api/learning/audit?${new URLSearchParams({grade:course.grade,subject:course.subject,language,offset})}`);
        courseTopics+=page.topics.length;
        for(const topic of page.topics) {
          if(checked.has(topic.lessonId))continue;
          checked.add(topic.lessonId);lessons++;
          const {lesson}=await get(`/api/learning/content/${topic.lessonId}`);
          assert.equal(lesson.grade,course.grade);assert.equal(lesson.subject,course.subject);assert.equal(lesson.language,language);
          if(lesson.id.startsWith("db-")) {
            const result=await pool.query("SELECT content,examples,key_points,jsonb_array_length(materials)::int AS material_count FROM mina_learning_lessons WHERE id=$1 AND review_status='published'",[lesson.id.slice(3)]);
            assert.equal(result.rows.length,1);
            const row=result.rows[0];
            assert.equal(lesson.content,row.content,"API notes must match stored notes character-for-character");
            assert.deepEqual(lesson.examples,row.examples);assert.deepEqual(lesson.keyPoints,row.key_points);
            assert.equal(lesson.materialOutline.length,row.material_count);
            let materialOffset=0;
            while(materialOffset<row.material_count) {
              const materialPage=await get(`/api/learning/content/${lesson.id}/materials?offset=${materialOffset}&limit=10`);
              const stored=await pool.query(`SELECT entry FROM mina_learning_lessons,
                LATERAL jsonb_array_elements(materials) WITH ORDINALITY AS section(entry,ordinal)
                WHERE id=$1 AND ordinal>$2::bigint AND ordinal<=$2::bigint+10 ORDER BY ordinal`,[lesson.id.slice(3),materialOffset]);
              assert.deepEqual(materialPage.materials,stored.rows.map(item=>item.entry),"No material payload may be dropped or shortened");
              assert.ok(materialPage.materials.length>0);materialCount+=materialPage.materials.length;materialOffset+=materialPage.materials.length;
            }
          } else {
            const original=history.completeLessons.find(item=>`history10-${item.number}`===lesson.id);
            assert.ok(original);
            for(const key of ["introduction","objectives","topics","examples","exercises","summary","revision"])if(original[key]!==undefined)assert.deepEqual(lesson[key],original[key],`${lesson.id}: ${key}`);
            assert.deepEqual(lesson.questions,original.questions.map(question=>({...question,choices:question.choices.map(choice=>choice.replace(/^[A-D]\.\s*/,""))})));
            assert.deepEqual(lesson.exerciseAnswers,historyAnswers[original.number].exerciseAnswers);
            assert.deepEqual(lesson.revisionAnswers,historyAnswers[original.number].revisionAnswers);
          }
        }
        offset=page.nextOffset;
      }while(offset!==null);
      assert.equal(courseTopics,course.topics);topics+=courseTopics;
    }
    topicCount+=topics;
    languages.push({language,catalogCombinations:overview.courses.length,availableLessons:lessons,availableTopics:topics,
      primaryCombinationsWithLessons:overview.courses.filter(course=>course.primary && course.lessons>0).length,
      primaryCombinationsWithoutLessons:overview.courses.filter(course=>course.primary && !course.lessons).length});
  }
  const published=await pool.query("SELECT id,grade,subject,language FROM mina_learning_lessons WHERE review_status='published' ORDER BY id");
  const unreachable=published.rows.filter(row=>!checked.has(`db-${row.id}`));
  if(unreachable.length)process.exitCode=1;
  console.log(JSON.stringify({checkedLessons:checked.size,checkedTopics:topicCount,checkedAdditionalMaterials:materialCount,languages,publishedRecordsNotAccessible:unreachable,
    result:unreachable.length?"Some published records are not accessible through the catalog; repair is required.":"Stored and bundled student-facing fields matched the API without content loss.",
    limitations:["This is an audit of registered records, not complete textbook ingestion.","Supplied PDFs and external textbooks are not fully mapped or imported.","Real signed-in authoring and external resource availability are not certified."]},null,2));
}finally{await pool.end();}
