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
