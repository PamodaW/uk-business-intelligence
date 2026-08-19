import * as cheerio from "cheerio";

const commonPaths = ["", "/contact", "/contact-us", "/about", "/about-us"];

function normaliseUrl(value) {
  if (!value) return null;
  let v = value.trim();
  if (!/^https?:\/\//i.test(v)) v = "https://" + v;
  try { return new URL(v).origin; } catch { return null; }
}

function extractEmails(html) {
  const $ = cheerio.load(html);
  const found = new Set();

  $("a[href^='mailto:']").each((_, el) => {
    const href = $(el).attr("href") || "";
    const email = href.replace(/^mailto:/i, "").split("?")[0].trim().toLowerCase();
    if (/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) found.add(email);
  });

  const text = $("body").text(" ");
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  for (const email of matches) found.add(email.toLowerCase());

  return [...found];
}

export async function enrichWebsite(website) {
  const origin = normaliseUrl(website);
  if (!origin) return { website: null, email: null, emailSource: null, status: "not_found" };

  const candidates = commonPaths.map(p => origin + p);
  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { "User-Agent": "UKBusinessIntelligence/1.0 (+public-business-contact-enrichment)" },
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) continue;
      const type = response.headers.get("content-type") || "";
      if (!type.includes("text/html")) continue;
      const html = await response.text();
      const emails = extractEmails(html);
      if (emails.length) {
        return { website: origin, email: emails[0], emailSource: url, status: "found" };
      }
    } catch {}
  }
  return { website: origin, email: null, emailSource: null, status: "not_found" };
}
