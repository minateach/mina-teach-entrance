import { createHash } from "node:crypto";
import history from "../learning/history-grade10.js";

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
  return {
    id:`db-${row.id}`, key:`lesson:${row.id}`, grade:row.grade, subject:row.subject,
    language:row.language, stream:row.stream, chapter:row.chapter, title:row.title,
    sourceLabel:row.source_label, origin:"reviewed",
    chapterId:chapterId(row.grade,row.subject,row.chapter),
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
  }));
}
const bundled = bundledSummaries();
export const compareLessons = (a,b) => collator.compare(a.chapter,b.chapter) || collator.compare(a.number || a.title,b.number || b.title) || collator.compare(a.id,b.id);
const metadataColumns = "id,grade,stream,subject,chapter,title,language,source_label";
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
      const lessons = await summaries(scope);
      return {grade:scope.grade,language:scope.language,coverage:"available-content-only",subjects:subjects.map(name => {
        const available = lessons.filter(lesson=>lesson.subject===name);
        return {name,lessonCount:available.length,chapterCount:new Set(available.map(lesson=>lesson.chapterId)).size,availableKeys:available.map(lesson=>lesson.key),startLessonId:available[0]?.id || null};
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
        return {...bundled[index], ...lesson, chapter:bundled[index].chapter, sourceUrl:history.source.url,
          sourceNote:history.source.note, summary:lesson.summary, content:lesson.introduction,
          questions:lesson.questions.map(question=>({...question,choices:question.choices.map(choice=>choice.replace(/^[A-D]\.\s*/,""))}))};
      }
      if (!/^db-[1-9]\d{0,17}$/.test(id)) throw new LearningInputError("Invalid lesson ID.");
      const result=await pool.query(`SELECT ${metadataColumns},content,examples,key_points,source_url FROM mina_learning_lessons WHERE id=$1 AND ${publishable}`,[id.slice(3)]);
      if (!result.rows.length) return null;
      const row=result.rows[0];
      return {...databaseSummary(row),content:row.content,examples:row.examples || [],keyPoints:row.key_points || [],sourceUrl:row.source_url || null};
    },
  };
}
