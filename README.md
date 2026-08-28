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
- `PATCH /api/leads/:number`
- `GET /api/export.csv`

## Email
For a company with a discoverable website, the backend checks the homepage and common contact/about pages and extracts public `mailto:` links and visible email addresses. It records the source URL. It does not infer `info@`, `hello@`, etc.

## Companies House
The live integration uses the official Companies House API. The API key stays on the backend.
