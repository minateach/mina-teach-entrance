import {readFile} from "node:fs/promises";
import pg from "pg";
if(process.env.REPLIT_DEPLOYMENT==="1")throw new Error("Apply the reviewed production migration through the publishing schema workflow, not this development setup script.");
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try {
  await pool.query(await readFile(new URL("../server/migrations/20261113-complete-topic-materials.sql",import.meta.url),"utf8"));
  await pool.query(await readFile(new URL("../server/migrations/20261115-gemini-grounding-usage.sql",import.meta.url),"utf8"));
  console.log("Applied non-destructive lesson-material and web-search-usage schema updates.");
}finally{await pool.end();}
