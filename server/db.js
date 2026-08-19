import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve("data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "business-intelligence.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS companies (
  company_number TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  status TEXT,
  incorporation_date TEXT,
  sic_codes TEXT,
  address TEXT,
  category TEXT,
  website TEXT,
  email TEXT,
  email_source TEXT,
  email_status TEXT DEFAULT 'not_found',
  lead_score INTEGER DEFAULT 0,
  lead_status TEXT DEFAULT 'new',
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

export default db;
