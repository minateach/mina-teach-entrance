import { createHash } from "node:crypto";
import history from "../learning/history-grade10.js";
import {materialOutlineSql,auditLessonTopics} from "./lesson-materials.mjs";
import {historyAnswers} from "./history-grade10-answers.mjs";

export const subjects = [
  "Mathematics", "Physics", "Chemistry", "Biology", "English", "Geography",
  "History", "Economics", "Civics and Ethics", "Afaan Oromoo", "Amharic",
  "ICT", "Aptitude", "Environmental Science", "General Knowledge",
  "Basic Technical Drawing", "General Business", "Health and Physical Education",
];
const collator = new Intl.Collator("en", {numeric: true, sensitivity: "base"});
export class LearningInputError extends Error {}
export function validateScope(query, requireSubject = false) {
  const grade = Number(query.grade ?? 9);
  const language = query.language || "en";
  const subject = query.subject === "Civics" ? "Civics and Ethics" : query.subject || "";
  if (![9,10,11,12].includes(grade)) throw new LearningInputError("Choose Grade 9, 10, 11, or 12.");
  if (!["en","om","am"].includes(language)) throw new LearningInputError("Choose English, Afaan Oromoo, or Amharic.");
  if ((requireSubject || subject) && !subjects.includes(subject)) throw new LearningInputError("This subject is not in the learning catalog.");
  if (query.stream && !["natural","social","common"].includes(query.stream)) throw new LearningInputError("Choose a valid stream.");
  return {grade, language, subject};
}
function chapterId(grade, subject, chapter) {
  return `chapter-${createHash("sha256").update(JSON.stringify([grade,subject,chapter])).digest("hex").slice(0,16)}`;
}
export function databaseSummary(row) {
  const key = `lesson:${row.id}${row.content_version>1?`:v${row.content_version}`:""}`;
  const topicIds=[...new Set(["0",...(row.material_outline || []).map(section=>section.topicId)])];
  const topicOutline=topicIds.map(id=>({id,title:id==="0"?row.title:(row.material_outline || []).find(material=>material.topicId===id)?.topicTitle || (row.material_outline || []).find(material=>material.topicId===id)?.title}));
  return {
    id:`db-${row.id}`, key, grade:row.grade, subject:row.subject,
    language:row.language, stream:row.stream, chapter:row.chapter, title:row.title,
    sourceLabel:row.source_label, origin:"reviewed",
    chapterId:chapterId(row.grade,row.subject,row.chapter),
    topicKeys:topicIds.map(id=>`${key}:topic:${id}`), practiceQuestionCount:(row.material_outline || []).filter(section=>section.type==="mcq").length,
    topicOutline,
  };
}
function bundledSummaries() {
  return history.completeLessons.map(lesson => ({
    id:`history10-${lesson.number}`, key:`curriculum:history:10:${lesson.number}`,
    number:lesson.number, grade:10, subject:"History", stream:"social", language:"en",
    chapter:`${lesson.unit}. ${lesson.unitTitle}`, chapterNumber:lesson.unit, title:lesson.title,
    sourceLabel:`${history.source.title} (${history.source.edition}), section ${lesson.number}`,
    chapterId:chapterId(10,"History",`${lesson.unit}. ${lesson.unitTitle}`),
    origin:"ai_authored",
    topicKeys:lesson.topics.map((_,index)=>`curriculum:history:10:${lesson.number}:topic:${index}`),
    topicOutline:lesson.topics.map((topic,index)=>({id:String(index),title:topic.title})),
    practiceQuestionCount:lesson.questions.length,
  }));
}
const bundled = bundledSummaries();
export const compareLessons = (a,b) => collator.compare(a.chapter,b.chapter) || collator.compare(a.number || a.title,b.number || b.title) || collator.compare(a.id,b.id);
const metadataColumns = `id,grade,stream,subject,chapter,title,language,source_label,content_version,${materialOutlineSql}`;
// Drafts are never promoted by this catalog. Even a published row must contain usable prose.
const publishable = "review_status='published' AND length(trim(content))>=80 AND length(trim(source_label))>0";

export function createLearningCatalog(pool) {
  async function summaries(scope) {
    const params = [scope.grade,scope.language];
    let filter = "";
    if (scope.subject) { params.push(scope.subject); filter = " AND subject=$3"; }
    const result = await pool.query(`SELECT ${metadataColumns} FROM mina_learning_lessons WHERE ${publishable} AND grade=$1 AND language=$2${filter}`,params);
    return [...result.rows.map(databaseSummary), ...bundled.filter(lesson => lesson.grade===scope.grade && lesson.language===scope.language && (!scope.subject || lesson.subject===scope.subject))].sort(compareLessons);
  }
  return {
    async catalog(query) {
      const scope = validateScope(query);
      const [lessons, questionCounts] = await Promise.all([
        summaries(scope),
        pool.query("SELECT subject,stream,COUNT(*)::int AS count FROM mina_questions WHERE grade=$1 AND review_status='approved' AND source_kind<>'ai_generated' GROUP BY subject,stream", [scope.grade]),
      ]);
      const reviewedCounts = new Map();
      for (const row of questionCounts.rows) {
        const name=row.subject==="Civics"?"Civics and Ethics":row.subject;
        const counts=reviewedCounts.get(name) || {natural:0,social:0};
        for(const stream of ["natural","social"])if(row.stream===stream || row.stream==="common")counts[stream]+=Number(row.count);
        reviewedCounts.set(name,counts);
      }
      return {grade:scope.grade,language:scope.language,coverage:"available-content-only",subjects:subjects.map(name => {
        const available = lessons.filter(lesson=>lesson.subject===name);
        const counts=reviewedCounts.get(name) || {natural:0,social:0};
        let practiceStream=["History","Geography","Economics","Civics and Ethics","General Business"].includes(name)?"social":"natural";
        const alternative=practiceStream==="natural"?"social":"natural";
        if(!counts[practiceStream] && counts[alternative])practiceStream=alternative;
        return {
          name,lessonCount:available.length,chapterCount:new Set(available.map(lesson=>lesson.chapterId)).size,
          availableKeys:available.map(lesson=>lesson.key),availableTopicKeys:available.flatMap(lesson=>lesson.topicKeys),
          startLessonId:available[0]?.id || null,
          practiceLessonId:available.find(lesson=>lesson.practiceQuestionCount>0)?.id || null,
          practiceQuestionCount:available.reduce((count,lesson)=>count+lesson.practiceQuestionCount,0),
          reviewedQuestionCount:counts[practiceStream], practiceStream,
        };
      })};
    },
    async course(query) {
      const scope = validateScope(query,true);
      const lessons = await summaries(scope);
      const chapters = [];
      for (const lesson of lessons) {
        let chapter = chapters.find(item=>item.id===lesson.chapterId);
        if (!chapter) { chapter={id:lesson.chapterId,number:lesson.chapterNumber || Number(lesson.chapter.match(/\d+/)?.[0]) || chapters.length+1,title:lesson.chapter,lessons:[]}; chapters.push(chapter); }
        chapter.lessons.push({...lesson,number:lesson.number || String(chapter.lessons.length+1)});
      }
      return {...scope,coverage:"available-content-only",chapters,lessonCount:lessons.length};
    },
    async lesson(id) {
      if (/^history10-\d+\.\d+(?:\.\d+)?$/.test(id)) {
        const index = bundled.findIndex(lesson=>lesson.id===id);
        if (index<0) return null;
        const lesson = history.completeLessons[index];
        return {...bundled[index], ...lesson, ...historyAnswers[lesson.number], chapter:bundled[index].chapter, sourceUrl:history.source.url,
          sourceNote:history.source.note, summary:lesson.summary, content:lesson.introduction,
          questions:lesson.questions.map(question=>({...question,choices:question.choices.map(choice=>choice.replace(/^[A-D]\.\s*/,""))}))};
      }
      if (!/^db-[1-9]\d{0,17}$/.test(id)) throw new LearningInputError("Invalid lesson ID.");
      const result=await pool.query(`SELECT ${metadataColumns},content,examples,key_points,source_url FROM mina_learning_lessons WHERE id=$1 AND ${publishable}`,[id.slice(3)]);
      if (!result.rows.length) return null;
      const row=result.rows[0];
      return {...databaseSummary(row),content:row.content,examples:row.examples || [],keyPoints:row.key_points || [],sourceUrl:row.source_url || null,materialOutline:row.material_outline || []};
    },
    async materials(id,query={}) {
      const offset=Number(query.offset ?? 0),limit=Number(query.limit ?? 10);
      if(!Number.isSafeInteger(offset) || offset<0 || !Number.isInteger(limit) || limit<1 || limit>50)throw new LearningInputError("Choose a valid material page and page size from 1 to 50.");
      if(!/^db-[1-9]\d{0,17}$/.test(id))throw new LearningInputError("Choose a database lesson ID.");
      const result=await pool.query(`SELECT jsonb_array_length(materials) AS total,
        COALESCE((SELECT jsonb_agg(entry ORDER BY ordinal) FROM jsonb_array_elements(materials) WITH ORDINALITY AS section(entry,ordinal)
        WHERE ordinal>$2::bigint AND ordinal<=$2::bigint+$3::bigint),'[]'::jsonb) AS items
        FROM mina_learning_lessons WHERE id=$1 AND ${publishable}`,[id.slice(3),offset,limit]);
      if(!result.rows.length)return null;
      const {total,items}=result.rows[0];
      return {materials:items,total,offset,nextOffset:offset+items.length<total?offset+items.length:null};
    },
    async audit(query={}) {
      const scope=validateScope(query);
      const grades=query.grade===undefined?[9,10,11,12]:[scope.grade];
      const drafts=await pool.query("SELECT grade,subject,COUNT(*)::int AS count FROM mina_learning_lessons WHERE language=$1 AND review_status='draft' GROUP BY grade,subject",[scope.language]);
      const courses=[],available=[];
      for(const grade of grades) {
        const lessons=await summaries({...scope,grade});available.push(...lessons);
        for(const subject of subjects.filter(name=>!scope.subject || name===scope.subject)) {
          const subset=lessons.filter(lesson=>lesson.subject===subject);
          courses.push({grade,subject,primary:subjects.indexOf(subject)<9,language:scope.language,lessons:subset.length,topics:subset.reduce((count,lesson)=>count+lesson.topicKeys.length,0),lessonPracticeMcqs:subset.reduce((count,lesson)=>count+lesson.practiceQuestionCount,0),
            drafts:drafts.rows.find(row=>row.grade===grade && row.subject===subject)?.count || 0,
            curriculumCompletenessVerified:false,sourceCoverage:"Full textbook chapter/topic mapping not yet verified"});
        }
      }
      let topics=[],nextOffset=null;
      if(query.grade!==undefined && scope.subject) {
        const offset=Number(query.offset ?? 0);
        if(!Number.isSafeInteger(offset) || offset<0)throw new LearningInputError("Choose a valid audit page.");
        const page=available.slice(offset,offset+10);
        const lessons=await Promise.all(page.map(lesson=>this.lesson(lesson.id)));
        topics=lessons.filter(Boolean).flatMap(auditLessonTopics);
        if(offset+page.length<available.length)nextOffset=offset+page.length;
      }
      return {scope:"Currently available student materials; not a certification of complete textbook coverage",
        limitations:["Uploaded source PDFs have not all been imported or mapped to topics.","This checks registered student-facing records, not every page of every external textbook.","External resource availability has not been fully checked."],
        language:scope.language,curriculumCompletenessVerified:false,courses,topics,nextOffset};
    },
  };
}
