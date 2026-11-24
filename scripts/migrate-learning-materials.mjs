import {readFile} from "node:fs/promises";
import pg from "pg";
if(process.env.REPLIT_DEPLOYMENT==="1")throw new Error("Apply the reviewed production migration through the publishing schema workflow, not this development setup script.");
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try {
  await pool.query(await readFile(new URL("../server/migrations/20261113-complete-topic-materials.sql",import.meta.url),"utf8"));
  await pool.query(await readFile(new URL("../server/migrations/20261115-gemini-grounding-usage.sql",import.meta.url),"utf8"));
  await pool.query(await readFile(new URL("../server/migrations/20261124-gemini-grounding-daily-limit.sql",import.meta.url),"utf8"));
  await pool.query(await readFile(new URL("../server/migrations/20261117-ai-image-usage.sql",import.meta.url),"utf8"));
  await pool.query(await readFile(new URL("../server/migrations/20261122-general-knowledge.sql",import.meta.url),"utf8"));
  console.log("Applied non-destructive lesson-material, web-search quota, image-usage, and General Knowledge schema updates.");
}finally{await pool.end();}
