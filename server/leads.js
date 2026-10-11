import db from "./db.js";
import { scoreLead } from "./scoring.js";

const setScore = db.prepare(
  "UPDATE companies SET lead_score=?, score_reasons=? WHERE company_number=?",
);

function applyScore(row) {
  const { score, reasons } = scoreLead(row);
  setScore.run(score, JSON.stringify(reasons), row.company_number);
}

export function rescore(companyNumber) {
  const row = db
    .prepare("SELECT * FROM companies WHERE company_number=?")
    .get(companyNumber);
  if (row) applyScore(row);
}

export function rescoreAll() {
  const rows = db.prepare("SELECT * FROM companies").all();
  db.transaction(() => rows.forEach(applyScore))();
}

/*
 * Save what getCompanyDetails() fetched: summary columns on the company,
 * plus a fresh copy of its officers and PSCs, then recompute the lead score.
 */
export function saveCompaniesHouseDetails(companyNumber, d) {
  const updateCompany = db.prepare(`UPDATE companies SET
    status=COALESCE(@status,status), accounts_next_due=@accounts_next_due,
    accounts_overdue=@accounts_overdue, confirmation_overdue=@confirmation_overdue,
    active_officers=@active_officers, active_pscs=@active_pscs,
    charges_outstanding=@charges_outstanding, filing_count=@filing_count,
    last_filing_date=@last_filing_date, recent_filings=@recent_filings,
    ch_synced_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
    WHERE company_number=@company_number`);
  const insertOfficer = db.prepare(`INSERT INTO officers
    (company_number,name,role,appointed_on,resigned_on,occupation) VALUES (?,?,?,?,?,?)`);
  const insertPsc = db.prepare(`INSERT INTO pscs
    (company_number,name,kind,natures_of_control,notified_on,ceased_on) VALUES (?,?,?,?,?,?)`);

  db.transaction(() => {
    updateCompany.run({
      ...d,
      recent_filings: JSON.stringify(d.recent_filings),
      company_number: companyNumber,
    });

    db.prepare("DELETE FROM officers WHERE company_number=?").run(companyNumber);
    for (const o of d.officers)
      insertOfficer.run(companyNumber, o.name, o.role, o.appointed_on, o.resigned_on, o.occupation);

    db.prepare("DELETE FROM pscs WHERE company_number=?").run(companyNumber);
    for (const p of d.pscs)
      insertPsc.run(
        companyNumber,
        p.name,
        p.kind,
        JSON.stringify(p.natures_of_control),
        p.notified_on,
        p.ceased_on,
      );
  })();

  rescore(companyNumber);
}
