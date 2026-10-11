# Project Map

## Purpose
Senior-facing prospecting dashboard for newly incorporated UK companies.

## Requirements
- Discover new UK companies and surface potential leads.
- Enrich company profiles with public contact information and Companies House data.
- The README says email addresses are not guessed and that authentication, robots controls, paywalls, and private areas are not bypassed.
- The requested project change is not specified yet.

## Components
- `client/index.html`, `client/main.js`, `client/style.css`: Vite-served vanilla JavaScript dashboard, filters, company table, detail drawer, and actions.
- `server/index.js`: Express API routes, company data mapping, CSV export, and serving the built client.
- `server/db.js`: SQLite schema and migrations for companies, officers, and persons with significant control.
- `server/companies-house.js`: Companies House API search and company detail requests.
- `server/enrichment.js`: Website discovery and public contact email enrichment.
- `server/scoring.js`, `server/leads.js`: lead scoring and persistence helpers.

## Main Flow
Browser dashboard ? Express `/api/*` ? SQLite company/lead records
Sync action ? Express ? Companies House API ? SQLite ? dashboard
Enrichment action ? Express ? public website discovery/contact lookup ? SQLite ? dashboard
Export action ? Express CSV endpoint ? downloaded CSV

## Data and Trust Boundaries
- SQLite database is created under `data/business-intelligence.db`.
- Companies House, Tavily, and Hunter API keys are read from environment variables; `.env.example` contains placeholders only.
- Public website content and external API responses enter server-side enrichment paths.
- No application authentication was verified during this inspection.

## Build and Deployment
- Root scripts: `npm run dev`, `npm run build`, `npm start`, and `npm test`.
- Client uses Vite; server uses Node.js and Express.
- `.replit` configures a build then start deployment and maps port 3000 to 80.
- README says the Express server serves the built Vite app and demo data can be used without a Companies House key.

## Unknowns
- Which feature or area the user wants to change.
- Learner familiarity and desired learning scope.
- Runtime behavior of the app and any deployed environment details.
