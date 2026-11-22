export const materialTypes = new Set(["notes","subtopic","definition","concept","objective","example","formula","diagram","table","activity","exercise","review","summary","mcq","resource","timeline"]);
const fields = new Set(["id","topicId","topicTitle","type","title","text","items","steps","term","definition","expression","explanation","headers","rows","url","alt","caption","question","answer","choices","correctIndex","events","sourceLabel","sourceUrl","sourcePages","sourceAuthor","sourcePublisher","sourcePublicationDate","sourceEdition","sourceFile","sourceTitle"]);
const nonempty=value=>typeof value==="string" && value.trim().length>0;
export const safeResourceUrl=value=>{
  if(typeof value!=="string")return false;
  if(/^\/(?!\/)/.test(value))return !value.includes("\\");
  try{return ["https:","http:"].includes(new URL(value).protocol);}catch{return false;}
};
function validTree(value,depth=0) {
  if(depth>16)return false;
  if(value===null || ["string","boolean"].includes(typeof value))return true;
  if(typeof value==="number")return Number.isFinite(value);
  if(Array.isArray(value))return value.every(item=>validTree(item,depth+1));
  return value && typeof value==="object" && Object.entries(value).every(([key,item])=>!["__proto__","constructor","prototype"].includes(key) && validTree(item,depth+1));
}
export function materialProblem(material) {
  if(!material || Array.isArray(material) || typeof material!=="object")return "Each material must be an object.";
  if(Object.keys(material).some(key=>!fields.has(key)))return "Unrecognized material fields; no fields were discarded.";
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(material.id || ""))return "Give each material a stable letters/numbers/hyphens ID.";
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(String(material.topicId ?? "0")))return "Choose a stable topic ID.";
  if(!materialTypes.has(material.type) || !nonempty(material.title))return "Choose a supported material type and a title.";
  if(!validTree(material))return "The material has invalid or excessively nested values; split it into additional sections.";
  for(const key of ["text","topicTitle","term","definition","expression","explanation","caption","alt","question","answer","sourceLabel","sourcePages","sourceAuthor","sourcePublisher","sourcePublicationDate","sourceEdition","sourceFile","sourceTitle"])
    if(material[key]!==undefined && typeof material[key]!=="string")return `${key} must contain text.`;
  for(const key of ["items","steps","events"])if(material[key]!==undefined && !Array.isArray(material[key]))return `${key} must be an array.`;
  for(const key of ["url","sourceUrl"])if(material[key]!==undefined && !safeResourceUrl(material[key]))return `${key} must be a safe web or local resource URL.`;
  if(material.type==="mcq") {
    if(!nonempty(material.question) || !Array.isArray(material.choices) || material.choices.length!==4 ||
      !material.choices.every(nonempty) || !Number.isInteger(material.correctIndex) || material.correctIndex<0 || material.correctIndex>3 ||
      !nonempty(material.explanation))return "MCQs require a question, four choices, correctIndex 0–3, and an explanation.";
  } else if(material.type==="table") {
    if(!Array.isArray(material.headers) || !material.headers.length || !material.headers.every(nonempty) ||
      !Array.isArray(material.rows) || !material.rows.length || !material.rows.every(row=>Array.isArray(row) && row.length===material.headers.length && row.every(cell=>typeof cell==="string")))return "Tables require headers and complete rows of text cells.";
  } else if(material.type==="diagram") {
    if(!safeResourceUrl(material.url) || !nonempty(material.alt) || material.url.startsWith("http:"))return "Diagrams require an HTTPS/local image URL and alternative text.";
  } else if(material.type==="resource") {
    if(!safeResourceUrl(material.url))return "Resources require a safe URL.";
  } else if(material.type==="formula") {
    if(!nonempty(material.expression) && !nonempty(material.text))return "Formulas require an expression or text.";
  } else if(material.type==="definition") {
    if(!(nonempty(material.term) && nonempty(material.definition)) && !material.items?.length)return "Definitions require terms and explanations.";
  } else if(["objective","summary"].includes(material.type)) {
    if(!nonempty(material.text) && !material.items?.length)return `${material.type === "objective" ? "Objectives" : "Summaries"} require text or a non-empty item list.`;
  } else if(["exercise","review"].includes(material.type)) {
    if(!nonempty(material.question) || !nonempty(material.answer))return "Exercises and review materials require a question and answer.";
  } else if(!nonempty(material.text) && !material.items?.length && !material.steps?.length && !material.events?.length)return "Material must contain actual text, steps, items, or events.";
  return null;
}
export function materialsProblem(materials) {
  if(!Array.isArray(materials))return "Materials must be an array.";
  const ids=new Set();
  for(const material of materials) {
    const error=materialProblem(material);if(error)return error;
    if(ids.has(material.id))return `Duplicate material ID: ${material.id}`;
    ids.add(material.id);
  }
  return null;
}
// Payloads remain in PostgreSQL. Catalogs contain only a stable, ordered outline.
export const materialOutlineSql = `COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'id',entry->>'id','topicId',COALESCE(entry->>'topicId','0'),'topicTitle',entry->>'topicTitle',
  'type',entry->>'type','title',entry->>'title',
  'contentCharacters',COALESCE((SELECT SUM(length(value))::int FROM jsonb_each_text(entry)
    WHERE key IN ('text','items','steps','term','definition','expression','explanation','headers','rows',
      'caption','question','answer','choices','events')),0),
  'sourceLabel',entry->>'sourceLabel','sourceUrl',entry->>'sourceUrl','sourcePages',entry->>'sourcePages',
  'sourceAuthor',entry->>'sourceAuthor','sourcePublisher',entry->>'sourcePublisher',
  'sourcePublicationDate',entry->>'sourcePublicationDate','sourceEdition',entry->>'sourceEdition',
  'sourceFile',entry->>'sourceFile','sourceTitle',entry->>'sourceTitle') ORDER BY ordinal)
  FROM jsonb_array_elements(materials) WITH ORDINALITY AS section(entry,ordinal)),'[]'::jsonb) AS material_outline`;

export function auditLessonTopics(lesson) {
  const topics=lesson.topics?.length?lesson.topics:[{title:lesson.title,notes:[lesson.content]}];
  const outline=lesson.materialOutline || [];
  const definitions=topics.map((topic,index)=>({id:String(index),title:topic.title,notes:topic.notes || [],terms:topic.terms || [],example:topic.example}));
  for(const section of outline)if(!definitions.some(topic=>topic.id===section.topicId))definitions.push({id:section.topicId,title:section.topicTitle || section.title,notes:[],terms:[]});
  return definitions.map(topic=>{
    const sections=outline.filter(section=>section.topicId===topic.id);
    const notes=Array.isArray(topic.notes)?topic.notes.join("\n"):topic.notes;
    const explanatorySections=sections.filter(section=>["notes","subtopic","concept"].includes(section.type));
    const materialExplanationCharacters=explanatorySections.reduce((count,section)=>count+(section.contentCharacters || 0),0);
    const missing=[];
    if(!notes?.trim() && !explanatorySections.length)missing.push("Topic explanation not supplied");
    if(!lesson.objectives?.length && !outline.some(section=>section.type==="objective"))missing.push("Learning objectives not supplied");
    if(!lesson.exerciseAnswers?.length && lesson.exercises?.length)missing.push("Answers to legacy lesson exercises not supplied");
    if(!lesson.revisionAnswers?.length && lesson.revision?.length)missing.push("Answers to legacy revision questions not supplied");
    if(!lesson.summary && !outline.some(section=>section.type==="summary"))missing.push("Lesson summary not supplied");
    return {
      id:topic.id,title:topic.title,lessonId:lesson.id,lessonTitle:lesson.title,grade:lesson.grade,subject:lesson.subject,language:lesson.language,
      noteCharacters:(notes?.length || 0)+materialExplanationCharacters,
      definitions:(topic.terms?.length || 0)+sections.filter(section=>section.type==="definition").length,
      exampleProvided:!!topic.example || sections.some(section=>section.type==="example"),
      materialSections:sections,topicMcqs:sections.filter(section=>section.type==="mcq").length,
      topicExercises:sections.filter(section=>section.type==="exercise").length,
      topicRevisionQuestions:sections.filter(section=>section.type==="review").length,
      sharedLessonMcqs:lesson.questions?.length || 0,
      sharedExercises:lesson.exercises?.length || 0,sharedRevisionQuestions:lesson.revision?.length || 0,
      sourceUrl:lesson.sourceUrl || null,sourceLabel:lesson.sourceLabel,missing,
      curriculumCompletenessVerified:false,
    };
  });
}
