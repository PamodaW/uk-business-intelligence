import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import db from "./db.js";
import { searchCompanies, getCompany } from "./companies-house.js";
import { enrichWebsite } from "./enrichment.js";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../client/dist");

app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: "1mb" }));

db.prepare("DELETE FROM companies WHERE company_number LIKE 'DEMO-%'").run();
db.prepare(
  "DELETE FROM companies WHERE company_number LIKE 'SC%' OR company_number LIKE 'SO%' OR company_number LIKE 'NI%' OR company_number LIKE 'NC%'",
).run();

function mapApiCompany(x) {
  const name = x.company_name || x.title || "";
  const addr = x.registered_office_address;
  const address = addr
    ? [addr.address_line_1, addr.address_line_2, addr.locality, addr.postal_code]
        .filter(Boolean)
        .join(", ")
    : [x.address_snippet].filter(Boolean).join("");
  return {
    company_number: x.company_number,
    company_name: name,
    status: x.company_status || "",
    incorporation_date: x.date_of_creation || "",
    sic_codes: JSON.stringify(x.sic_codes || []),
    address,
    category: inferCategory((x.sic_codes || []).join(" ") + " " + name),
  };
}
function inferCategory(text) {
  const t = text.toLowerCase();
  if (
    /software|computer|it |information technology|ai|technology|programming/.test(
      t,
    )
  )
    return "Technology";
  if (/real estate|property|estate agent|survey/.test(t)) return "Property";
  if (/retail|shop|fashion|jewel|marketplace|ecommerce|e-commerce/.test(t))
    return "Retail / E-commerce";
  if (/travel|tour|hotel|hospitality/.test(t)) return "Travel / Hospitality";
  if (/logistic|freight|transport|shipping/.test(t)) return "Logistics";
  if (/clinic|health|beauty|skin|hair|medical/.test(t))
    return "Health / Beauty";
  if (/consult|advis|professional/.test(t)) return "Professional Services";
  return "Other";
}
function rowToJson(r) {
  return { ...r, sic_codes: safeJson(r.sic_codes) };
}
function safeJson(v) {
  try {
    return JSON.parse(v || "[]");
  } catch {
    return [];
  }
}

app.get("/api/health", (req, res) =>
  res.json({ ok: true, time: new Date().toISOString() }),
);

app.get("/api/companies", (req, res) => {
  const {
    query = "",
    category = "",
    location = "",
    from = "",
    to = "",
    limit = "100",
  } = req.query;
  const where = [],
    args = [];
  if (query) {
    where.push("(company_name LIKE ? OR notes LIKE ?)");
    args.push(`%${query}%`, `%${query}%`);
  }
  if (category) {
    where.push("category=?");
    args.push(category);
  }
  if (location) {
    where.push("address LIKE ?");
    args.push(`%${location}%`);
  }
  if (from) {
    where.push("incorporation_date>=?");
    args.push(from);
  }
  if (to) {
    where.push("incorporation_date<=?");
    args.push(to);
  }
  const sql = `SELECT * FROM companies ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY incorporation_date DESC, company_name LIMIT ?`;
  args.push(Math.min(Number(limit) || 100, 500));
  const rows = db
    .prepare(sql)
    .all(...args)
    .map(rowToJson);
  res.json({ items: rows, total: rows.length });
});

app.get("/api/companies/:number", (req, res) => {
  const row = db
    .prepare("SELECT * FROM companies WHERE company_number=?")
    .get(req.params.number);
  if (!row) return res.status(404).json({ error: "Company not found" });
  res.json(rowToJson(row));
});

app.post("/api/companies/sync", async (req, res) => {
  if (!process.env.COMPANIES_HOUSE_API_KEY)
    return res.status(503).json({
      error:
        "Companies House API key is not configured. Add it to Replit Secrets.",
    });
  try {
    const data = await searchCompanies(req.body || {});
    const insert = db.prepare(`INSERT INTO companies
      (company_number,company_name,status,incorporation_date,sic_codes,address,category,updated_at)
      VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(company_number) DO UPDATE SET
      company_name=excluded.company_name,status=excluded.status,incorporation_date=excluded.incorporation_date,
      sic_codes=excluded.sic_codes,address=excluded.address,category=excluded.category,updated_at=CURRENT_TIMESTAMP`);
    const tx = db.transaction((items) =>
      items.forEach((x) =>
        insert.run(
          x.company_number,
          x.company_name,
          x.company_status,
          x.incorporation_date,
          x.sic_codes,
          x.address,
          x.category,
        ),
      ),
    );
    const mapped = (data.items || [])
      .map(mapApiCompany)
      .filter((x) => !/^(SC|SO|NI|NC)/i.test(x.company_number));
    tx(mapped);
    res.json({ imported: mapped.length, items: mapped });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.post("/api/companies/:number/enrich", async (req, res) => {
  const row = db
    .prepare("SELECT * FROM companies WHERE company_number=?")
    .get(req.params.number);
  if (!row) return res.status(404).json({ error: "Company not found" });
  try {
    const result = await enrichWebsite(
      req.body?.website || row.website,
      row.company_name,
    );
    db.prepare(
      `UPDATE companies SET website=?,email=?,email_source=?,email_status=?,updated_at=CURRENT_TIMESTAMP WHERE company_number=?`,
    ).run(
      result.website,
      result.email,
      result.emailSource,
      result.status,
      req.params.number,
    );
    res.json({ ...rowToJson(row), ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch("/api/leads/:number", (req, res) => {
  const allowed = ["lead_status", "lead_score", "notes", "website"];
  const updates = Object.entries(req.body || {}).filter(([k]) =>
    allowed.includes(k),
  );
  if (!updates.length)
    return res.status(400).json({ error: "No editable fields" });
  const sql = `UPDATE companies SET ${updates.map(([k]) => `${k}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE company_number=?`;
  db.prepare(sql).run(...updates.map(([, v]) => v), req.params.number);
  const row = db
    .prepare("SELECT * FROM companies WHERE company_number=?")
    .get(req.params.number);
  res.json(rowToJson(row));
});

app.get("/api/export.csv", (req, res) => {
  const rows = db
    .prepare(
      "SELECT company_name,company_number,incorporation_date,category,address,website,email,email_status,lead_score,lead_status FROM companies ORDER BY incorporation_date DESC",
    )
    .all();
  const headers = Object.keys(rows[0] || { company_name: "" });
  const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=uk-business-leads.csv",
  );
  res.send(csv);
});

app.use(express.static(clientDist));
app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(PORT, () =>
  console.log(`UK Business Intelligence running on ${PORT}`),
);
