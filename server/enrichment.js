import * as cheerio from "cheerio";

const commonPaths = [
  "",
  "/contact",
  "/contact-us",
  "/about",
  "/about-us"
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


/*
 * Automatically discover the company's public website.
 *
 * Requires:
 * BING_SEARCH_API_KEY
 */
async function discoverWebsite(companyName) {
  const key = process.env.BING_SEARCH_API_KEY;

  if (!key) {
    return null;
  }

  const params = new URLSearchParams({
    q: `"${companyName}" UK official website`,
    count: "5",
    responseFilter: "Webpages",
    safeSearch: "Moderate"
  });

  try {
    const response = await fetch(
      `https://api.bing.microsoft.com/v7.0/search?${params}`,
      {
        headers: {
          "Ocp-Apim-Subscription-Key": key
        },
        signal: AbortSignal.timeout(8000)
      }
    );

    if (!response.ok) {
      console.error(
        "Bing search failed:",
        response.status
      );

      return null;
    }

    const data = await response.json();

    const pages = data.webPages?.value || [];

    for (const page of pages) {
      const url = normaliseUrl(page.url);

      if (!url) continue;

      const hostname =
        new URL(url).hostname.toLowerCase();

      // Don't treat social media/search engines as the company website
      if (
        hostname.includes("bing.com") ||
        hostname.includes("google.") ||
        hostname.includes("facebook.com") ||
        hostname.includes("instagram.com") ||
        hostname.includes("linkedin.com") ||
        hostname.includes("youtube.com") ||
        hostname.includes("yelp.") ||
        hostname.includes("yellowpages.")
      ) {
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

  return {
    website: discoveredWebsite,

    email: null,

    emailSource: null,

    status: "not_found",

    message:
      "Website found, but no public business email was discovered."
  };
}