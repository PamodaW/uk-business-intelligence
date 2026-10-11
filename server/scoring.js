/*
 * Lead score, 0-100, computed from signals already stored on a company row.
 * Every point awarded or removed is listed in `reasons`, so the UI can show
 * why a company scored what it did. Tune the numbers below to taste; the
 * maximum (everything present, freshly incorporated, Technology) adds up to 100.
 */
export const WEIGHTS = {
  website: 15,
  email: 25,
  targetCategory: 15,
  otherCategory: 8,
  officersTeam: 15, // 2 or more active officers
  officerSolo: 7,
  ownerIdentified: 10,
  overduePenalty: -10
};

// Recency of incorporation: [max age in days, points]
export const RECENCY = [
  [30, 20],
  [90, 14],
  [180, 8],
  [365, 4]
];

export const TARGET_CATEGORIES = ["Technology"];

const DAY_MS = 864e5;

export function scoreLead(company, now = new Date()) {
  // Dissolved, in liquidation etc. - nothing to prospect. A missing status
  // means we haven't asked Companies House yet, so don't penalise it.
  if (company.status && company.status !== "active") {
    return {
      score: 0,
      reasons: [{ label: `Company is not active (${company.status})`, points: 0 }]
    };
  }

  const reasons = [];
  const add = (label, points) => {
    if (points) reasons.push({ label, points });
  };

  if (company.website) add("Website found", WEIGHTS.website);
  if (company.email) add("Public email found", WEIGHTS.email);

  if (TARGET_CATEGORIES.includes(company.category)) {
    add(`${company.category} company`, WEIGHTS.targetCategory);
  } else if (company.category && company.category !== "Other") {
    add(`${company.category} company`, WEIGHTS.otherCategory);
  }

  const incorporated = Date.parse(company.incorporation_date);
  if (!Number.isNaN(incorporated)) {
    const ageDays = (now.getTime() - incorporated) / DAY_MS;
    const tier = RECENCY.find(([maxDays]) => ageDays <= maxDays);
    if (tier) add(`Incorporated within ${tier[0]} days`, tier[1]);
  }

  // Officer and PSC counts are null until Companies House details are fetched.
  if (company.active_officers >= 2) {
    add(`${company.active_officers} active officers`, WEIGHTS.officersTeam);
  } else if (company.active_officers === 1) {
    add("1 active officer", WEIGHTS.officerSolo);
  }

  if (company.active_pscs >= 1) add("Owner (PSC) identified", WEIGHTS.ownerIdentified);

  if (company.accounts_overdue || company.confirmation_overdue) {
    add("Overdue filings", WEIGHTS.overduePenalty);
  }

  const total = reasons.reduce((sum, r) => sum + r.points, 0);
  return { score: Math.max(0, Math.min(100, total)), reasons };
}
