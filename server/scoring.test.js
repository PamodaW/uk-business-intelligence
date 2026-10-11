import test from "node:test";
import assert from "node:assert/strict";
import { scoreLead } from "./scoring.js";

const now = new Date("2026-09-21");

const full = {
  status: "active",
  category: "Technology",
  incorporation_date: "2026-09-10",
  website: "https://example-co.uk",
  email: "hello@example-co.uk",
  active_officers: 2,
  active_pscs: 1,
  accounts_overdue: 0,
  confirmation_overdue: 0
};

test("a fresh, fully contactable, enriched tech company scores 100", () => {
  assert.equal(scoreLead(full, now).score, 100);
});

test("a company with no signals scores 0", () => {
  assert.equal(scoreLead({}, now).score, 0);
});

test("inactive companies score 0 with an explanation", () => {
  const r = scoreLead({ ...full, status: "dissolved" }, now);
  assert.equal(r.score, 0);
  assert.match(r.reasons[0].label, /not active \(dissolved\)/);
});

test("a missing status is not treated as inactive", () => {
  assert.ok(scoreLead({ ...full, status: null }, now).score > 0);
  assert.ok(scoreLead({ ...full, status: "" }, now).score > 0);
});

test("officer and PSC signals are skipped until Companies House data is fetched", () => {
  const r = scoreLead({ ...full, active_officers: null, active_pscs: null }, now);
  assert.equal(r.score, 75);
});

test("one officer scores less than a team", () => {
  const solo = scoreLead({ ...full, active_officers: 1 }, now).score;
  assert.equal(solo, 92);
});

test("recency tiers step down with age", () => {
  const at = (date) => scoreLead({ incorporation_date: date }, now).score;
  assert.equal(at("2026-09-01"), 20); // 20 days
  assert.equal(at("2026-07-01"), 14); // 82 days
  assert.equal(at("2026-05-01"), 8); // 143 days
  assert.equal(at("2025-12-01"), 4); // 294 days
  assert.equal(at("2024-01-01"), 0);
});

test("unparseable incorporation dates add nothing", () => {
  assert.equal(scoreLead({ incorporation_date: "" }, now).score, 0);
  assert.equal(scoreLead({ incorporation_date: "nonsense" }, now).score, 0);
});

test("overdue filings subtract points but never go below 0", () => {
  assert.equal(scoreLead({ ...full, accounts_overdue: 1 }, now).score, 90);
  assert.equal(scoreLead({ accounts_overdue: 1 }, now).score, 0);
});

test("non-target categories score less than Technology, 'Other' scores nothing", () => {
  const score = (category) => scoreLead({ category }, now).score;
  assert.equal(score("Technology"), 15);
  assert.equal(score("Property"), 8);
  assert.equal(score("Other"), 0);
});

test("reasons add up to the score", () => {
  const r = scoreLead({ ...full, accounts_overdue: 1 }, now);
  assert.equal(r.reasons.reduce((sum, x) => sum + x.points, 0), r.score);
});
