import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve("data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "business-intelligence.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

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

CREATE TABLE IF NOT EXISTS officers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_number TEXT NOT NULL REFERENCES companies(company_number) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  appointed_on TEXT,
  resigned_on TEXT,
  occupation TEXT
);
CREATE INDEX IF NOT EXISTS idx_officers_company ON officers(company_number);

CREATE TABLE IF NOT EXISTS pscs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_number TEXT NOT NULL REFERENCES companies(company_number) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT,
  natures_of_control TEXT,
  notified_on TEXT,
  ceased_on TEXT
);
CREATE INDEX IF NOT EXISTS idx_pscs_company ON pscs(company_number);
`);

// CREATE TABLE IF NOT EXISTS won't add columns to a database created by an
// earlier version, so add anything missing. NULL means "not fetched yet".
const companiesHouseColumns = {
  ch_synced_at: "TEXT",
  active_officers: "INTEGER",
  active_pscs: "INTEGER",
  charges_outstanding: "INTEGER",
  accounts_next_due: "TEXT",
  accounts_overdue: "INTEGER",
  confirmation_overdue: "INTEGER",
  filing_count: "INTEGER",
  last_filing_date: "TEXT",
  recent_filings: "TEXT",
  score_reasons: "TEXT"
};

const existing = new Set(db.prepare("PRAGMA table_info(companies)").all().map((c) => c.name));
for (const [name, type] of Object.entries(companiesHouseColumns)) {
  if (!existing.has(name)) db.exec(`ALTER TABLE companies ADD COLUMN ${name} ${type}`);
}

export default db;
