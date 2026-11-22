import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { scoreRecord, searchableText } from "../knowledge-base/records.mjs";

const args = process.argv.slice(2);
const query = args.filter(arg => !arg.startsWith("--")).join(" ").trim();
const limitArg = args.find(arg => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : 10;
const input = args.find(arg => arg.startsWith("--file="))?.slice("--file=".length) || "generated-artifacts/knowledge-base/records.jsonl";
if (!query) throw new Error('Provide a search query, e.g. npm run knowledge:search -- "capitalism industrialization".');
if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("--limit must be an integer from 1 to 100.");

const matches = [];
const lines = createInterface({ input: createReadStream(input), crlfDelay: Infinity });
for await (const line of lines) {
  if (!line.trim()) continue;
  const record = JSON.parse(line);
  const score = scoreRecord(record, query);
  if (score > 0) {
    const text = searchableText(record);
    const queryAt = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
    const position = queryAt >= 0 ? queryAt : Math.max(0, text.toLocaleLowerCase().indexOf(query.trim().split(/\s+/)[0].toLocaleLowerCase()));
    const snippet = text.slice(Math.max(0, position - 100), Math.min(text.length, position + 500)).replace(/\s+/g, " ").trim();
    matches.push({ score, id: record.id, subject: record.subject, grade: record.grade, chapter: record.chapter, topic: record.topic, language: record.language, content_type: record.content_type, source: record.source, page: record.page, review_status: record.review_status, snippet });
  }
}
matches.sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)));
console.log(JSON.stringify({ query, totalMatches: matches.length, matches: matches.slice(0, limit) }, null, 2));
