const BASE = "https://api.company-information.service.gov.uk";

function authHeader() {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) throw new Error("COMPANIES_HOUSE_API_KEY is not configured");
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

export async function searchCompanies({ q="", from="", to="", limit=50 }) {
  const params = new URLSearchParams({ size: String(Math.min(Number(limit)||50,100)) });
  if (q) params.set("company_name_includes", q);
  if (from) params.set("incorporated_from", from);
  if (to) params.set("incorporated_to", to);

  const response = await fetch(`${BASE}/advanced-search/companies?${params}`, {
    headers: { Authorization: authHeader(), Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Companies House search failed: ${response.status}`);
  return response.json();
}

export async function getCompany(companyNumber) {
  const response = await fetch(`${BASE}/company/${encodeURIComponent(companyNumber)}`, {
    headers: { Authorization: authHeader(), Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Companies House company lookup failed: ${response.status}`);
  return response.json();
}

/*
 * Companies House allows 600 requests per 5 minutes per key. Every call to
 * chGet waits for its slot, so bulk enrichment can't trip the limit.
 */
const MIN_INTERVAL_MS = 550;
let nextSlot = 0;

async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_INTERVAL_MS;
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
}

// Returns parsed JSON, or null on a 404 when `optional` (e.g. a company with
// no charges or an exempt company with no PSC register).
async function chGet(path, { optional = false } = {}) {
  for (let attempt = 0; ; attempt++) {
    await throttle();

    const response = await fetch(`${BASE}${path}`, {
      headers: { Authorization: authHeader(), Accept: "application/json" },
      signal: AbortSignal.timeout(10000)
    });

    if (response.status === 429 && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      continue;
    }
    if (optional && response.status === 404) return null;
    if (!response.ok) throw new Error(`Companies House request failed: ${response.status} ${path}`);
    return response.json();
  }
}

/*
 * Everything Companies House publishes about one company beyond the search
 * result: profile flags, directors, owners (PSCs), filings and charges.
 * Uses 4-5 API calls per company.
 */
export async function getCompanyDetails(companyNumber) {
  const n = encodeURIComponent(companyNumber);
  const profile = await chGet(`/company/${n}`);

  const [officers, pscs, filings, charges] = await Promise.all([
    chGet(`/company/${n}/officers?items_per_page=100`, { optional: true }),
    chGet(`/company/${n}/persons-with-significant-control?items_per_page=100`, { optional: true }),
    chGet(`/company/${n}/filing-history?items_per_page=5`, { optional: true }),
    // The profile says whether any charges exist, which saves a call (and a 404).
    profile.has_charges
      ? chGet(`/company/${n}/charges`, { optional: true })
      : Promise.resolve(null)
  ]);

  const filingItems = filings?.items || [];

  return {
    status: profile.company_status || null,
    accounts_next_due: profile.accounts?.next_due || null,
    accounts_overdue: profile.accounts?.overdue ? 1 : 0,
    confirmation_overdue: profile.confirmation_statement?.overdue ? 1 : 0,
    active_officers: officers?.active_count ?? 0,
    active_pscs: pscs?.active_count ?? 0,
    charges_outstanding: charges?.unsatisfied_count ?? 0,
    filing_count: filings?.total_count ?? 0,
    last_filing_date: filingItems[0]?.date || null,
    recent_filings: filingItems.map((f) => ({
      date: f.date,
      category: f.category,
      description: f.description
    })),
    officers: (officers?.items || []).map((o) => ({
      name: o.name,
      role: o.officer_role || "",
      appointed_on: o.appointed_on || null,
      resigned_on: o.resigned_on || null,
      occupation: o.occupation || null
    })),
    pscs: (pscs?.items || []).map((p) => ({
      // Super-secure PSCs are exempt from publication and have no name.
      name: p.name || "Undisclosed (protected by law)",
      kind: p.kind || "",
      natures_of_control: p.natures_of_control || [],
      notified_on: p.notified_on || null,
      ceased_on: p.ceased_on || null
    }))
  };
}
