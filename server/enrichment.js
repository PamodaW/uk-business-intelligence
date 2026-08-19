import * as cheerio from "cheerio";

const commonPaths = [
  "",
  "/contact",
  "/contact-us",
  "/get-in-touch",
  "/about",
  "/about-us",
  "/team",
  "/support",
  "/privacy-policy",
  "/privacy",
  "/terms"
];

function normaliseUrl(value) {
  if (!value) return null;

  let v = value.trim();

  if (!/^https?:\/\//i.test(v)) {
    v = "https://" + v;
  }

  try {
    return new URL(v).origin;
  } catch {
    return null;
  }
}

function extractEmails(html) {
  const $ = cheerio.load(html);
  const found = new Set();

  // Find mailto links
  $("a[href^='mailto:']").each((_, el) => {
    const href = $(el).attr("href") || "";

    const email = href
      .replace(/^mailto:/i, "")
      .split("?")[0]
      .trim()
      .toLowerCase();

    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      found.add(email);
    }
  });

  // Find visible email addresses
  const text = $("body").text(" ");

  const matches =
    text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];

  for (const email of matches) {
    found.add(email.toLowerCase());
  }

  // Remove obvious fake/example addresses
  return [...found].filter(
    (email) =>
      !/example\.(com|org|net)$/i.test(email) &&
      !/yourdomain/i.test(email) &&
      !/sentry/i.test(email)
  );
}


const directoryDomains = [
  "bing.com",
  "google.",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "yelp.",
  "yellowpages.",
  "endole.co.uk",
  "companiesintheuk.co.uk",
  "opencorporates.com",
  "checkcompanyhouse.co.uk",
  "bizdb.co.uk",
  "bizlead.co.uk",
  "dnb.com",
  "cheapaccounting.co.uk",
  "companycheck.co.uk",
  "192.com",
  "thecompanywarehouse.co.uk",
  "corpwatch.org",
  "redflagalert.com",
  "creditsafe.com",
  "duedil.com",
  "gov.uk",
  "wikipedia.org",
  "wikidata.org",
  "crunchbase.com",
  "bloomberg.com",
  "reuters.com",
  "forbes.com",
  "ft.com",
  "trustpilot.com",
  "glassdoor.com",
  "indeed.com",
  "companieshouse.gov.uk",
];

function coreCompanyWords(companyName) {
  return companyName
    .toLowerCase()
    .replace(/\b(ltd|limited|llp|plc|the|and|co|company)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 2);
}

function looksRelevant(companyName, page) {
  const words = coreCompanyWords(companyName);

  if (!words.length) return true;

  const haystack = `${page.title || ""} ${page.content || ""}`.toLowerCase();
  const matches = words.filter((w) => haystack.includes(w));

  return matches.length >= Math.ceil(words.length * 0.6);
}

/*
 * Automatically discover the company's public website.
 *
 * Requires:
 * TAVILY_API_KEY
 */
async function discoverWebsite(companyName) {
  const key = process.env.TAVILY_API_KEY;

  if (!key) {
    return null;
  }

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        query: `"${companyName}" UK official website`,
        max_results: 5
      }),
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      console.error(
        "Tavily search failed:",
        response.status
      );

      return null;
    }

    const data = await response.json();

    const pages = data.results || [];

    for (const page of pages) {
      const url = normaliseUrl(page.url);

      if (!url) continue;

      const hostname =
        new URL(url).hostname.toLowerCase();

      // Don't treat social media/search engines/company directories as the company website
      if (directoryDomains.some((d) => hostname.includes(d))) {
        continue;
      }

      // Skip results that don't actually mention the company
      if (!looksRelevant(companyName, page)) {
        continue;
      }

      return url;
    }
  } catch (error) {
    console.error(
      "Website discovery error:",
      error.message
    );
  }

  return null;
}


/*
 * Fallback: look up publicly-indexed emails for a domain via Hunter.io,
 * for cases where the site itself only offers a contact form.
 *
 * Requires:
 * HUNTER_API_KEY
 */
async function hunterDomainSearch(domain) {
  const key = process.env.HUNTER_API_KEY;

  if (!key || !domain) {
    return null;
  }

  try {
    const params = new URLSearchParams({ domain, api_key: key, limit: "10" });

    const response = await fetch(
      `https://api.hunter.io/v2/domain-search?${params}`,
      { signal: AbortSignal.timeout(8000) }
    );

    if (!response.ok) {
      console.error("Hunter domain search failed:", response.status);
      return null;
    }

    const data = await response.json();
    const emails = data.data?.emails || [];

    if (!emails.length) return null;

    const generic = emails.find((e) => e.type === "generic");
    const best =
      generic ||
      [...emails].sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];

    return best?.value || null;
  } catch (error) {
    console.error("Hunter domain search error:", error.message);
  }

  return null;
}

/*
 * Main enrichment function
 */
export async function enrichWebsite(
  website,
  companyName = ""
) {
  // If website already exists, use it.
  // Otherwise automatically search for it.
  const discoveredWebsite =
    normaliseUrl(website) ||
    await discoverWebsite(companyName);

  if (!discoveredWebsite) {
    return {
      website: null,
      email: null,
      emailSource: null,
      status: "not_found",
      message:
        "No public company website was discovered."
    };
  }

  /*
   * Check several common pages for public emails.
   */
  const pagesToCheck =
    commonPaths.map(
      (path) => discoveredWebsite + path
    );

  for (const url of pagesToCheck) {
    try {
      const response = await fetch(url, {
        redirect: "follow",

        headers: {
          "User-Agent":
            "UKBusinessIntelligence/1.0 (public business contact discovery)"
        },

        signal: AbortSignal.timeout(8000)
      });

      if (!response.ok) {
        continue;
      }

      const contentType =
        response.headers.get("content-type") || "";

      if (!contentType.includes("text/html")) {
        continue;
      }

      const html = await response.text();

      const emails = extractEmails(html);

      if (emails.length > 0) {
        return {
          website: discoveredWebsite,

          email: emails[0],

          emailSource: url,

          status: "found",

          message:
            "Public business email found on company website."
        };
      }
    } catch (error) {
      // Continue checking other pages
    }
  }

  /*
   * The site itself didn't expose an email (common for sites that only
   * offer a contact form). Fall back to a publicly-indexed email lookup.
   */
  const domain = new URL(discoveredWebsite).hostname.replace(/^www\./, "");
  const hunterEmail = await hunterDomainSearch(domain);

  if (hunterEmail) {
    return {
      website: discoveredWebsite,

      email: hunterEmail,

      emailSource: null,

      status: "found",

      message:
        "Public business email found via email lookup service."
    };
  }

  return {
    website: discoveredWebsite,

    email: null,

    emailSource: null,

    status: "not_found",

    message:
      "Website found, but no public business email was discovered."
  };
}