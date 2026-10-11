# UK Business Intelligence

A senior-facing prospecting dashboard for newly incorporated UK companies.

## Stack
- Node.js + Express
- Vite + vanilla JS frontend
- SQLite via better-sqlite3
- Companies House REST API
- Public website email discovery using server-side HTML parsing

## Important
The application never guesses email addresses. It only stores email addresses found on publicly accessible business pages. It does not bypass authentication, robots controls, paywalls, or private areas.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env`
3. Add a Companies House API key to `COMPANIES_HOUSE_API_KEY`
4. `npm run dev`

For a production Replit deployment:
- Set `COMPANIES_HOUSE_API_KEY` as a Secret.
- Run `npm run build && npm start`.
- The Express server serves the built Vite app.

Without an API key, the app still runs with demo data so the UI can be presented.

## API
- `GET /api/health`
- `GET /api/companies?query=&category=&location=&from=&to=&limit=`
- `GET /api/companies/:number`
- `POST /api/companies/sync`
- `POST /api/companies/:number/enrich`
- `POST /api/companies/:number/companies-house`
- `PATCH /api/leads/:number`
- `GET /api/export.csv`

## Email
For a company with a discoverable website, the backend checks the homepage and common contact/about pages and extracts public `mailto:` links and visible email addresses. It records the source URL. It does not infer `info@`, `hello@`, etc.

## Companies House
The live integration uses the official Companies House API. The API key stays on the backend.

Besides the new-company search, `POST /api/companies/:number/companies-house` (the **Fetch Companies House Data** buttons in the UI) pulls, for one company:
- the company profile (status, accounts and confirmation-statement due dates and overdue flags)
- directors and officers, including resigned ones
- persons with significant control (owners)
- the five most recent filings and the total filing count
- the number of outstanding charges

That is 4-5 API calls per company. Companies House allows 600 requests per 5 minutes, so the server spaces its calls out (and retries on `429`); fetching a batch of 100 companies takes a few minutes. Companies that are exempt from the PSC register or have no charges are handled without errors.

## Lead score
`lead_score` (0-100) is computed on the server by `server/scoring.js` and recomputed whenever a company is synced, enriched, edited or has Companies House data fetched. It is not editable through the API. Each point is listed in `score_reasons` and shown in the company panel.

| Signal | Points |
|---|---|
| Website found | +15 |
| Public email found | +25 |
| Technology company / other known industry | +15 / +8 |
| Incorporated within 30 / 90 / 180 / 365 days | +20 / +14 / +8 / +4 |
| 2+ active officers / 1 active officer | +15 / +7 |
| Owner (PSC) identified | +10 |
| Overdue accounts or confirmation statement | -10 |

Companies whose status is anything other than `active` (dissolved, in liquidation, etc.) score 0. Officer and PSC signals only count once Companies House data has been fetched. The weights and target industries are constants at the top of `server/scoring.js`.

## Tests
`npm test` runs the scoring unit tests with Node's built-in test runner.
