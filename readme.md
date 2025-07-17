# Fabs Fact Database

This project provides an authenticated web app and API for managing and accessing a database of facts. It integrates Discord OAuth authentication, a React frontend, and an Express backend.

## Tech Stack

* **Frontend:** React, React Router, Parcel (build tool)
* **Backend:** Node.js, Express, Passport.js (Discord OAuth)
* **Database:** SQLite3, Knex.js
* **Styling:** Sass Modules

## Project Structure

```
.
├── auth
│   ├── authRouter.js (Express routes for authentication)
│   ├── discordRouter.js (Discord OAuth routes)
│   └── passport*discord.js (Passport Discord strategy)
├── db
│   ├── dev.sqlite3 (development database)
│   ├── factRepository.js (DB operations)
│   ├── knexfile.js (Knex DB config)
│   └── schema.js (DB schema definitions)
├── fact_index (Frontend)
│   ├── src
│   │   ├── components (React components)
│   │   ├── context (Auth context)
│   │   ├── pages (Page components)
│   │   └── hocks (Custom hooks)
├── router (Backend API and static content routes)
│   ├── api.js
│   ├── fact
│   │   └── facts.js (Fact CRUD API)
│   └── sys_health (Health check routes)
└── main.js (Backend entry point)
```

## Getting Started

### Prerequisites

* Node.js v22+
* npm

### Setup

1. Clone the repository:

```bash
git clone <repo*url>
cd fact_index_tacc
```

2. Install dependencies:

Run the following commands both at the project root and inside the /fact_index/ folder to install backend and frontend dependencies:

```bash
npm install
cd fact_index
npm install
```

3. Setup environment variables:

Create a `.env` file at the project root:

```env
PORT=16261
DISCORD_CLIENT_ID=<your_discord_client_id>
DISCORD_CLIENT_SECRET=<your_discord_secret>
DISCORD_GUILD_ID=<your_guild_id>
DISCORD_ROLE_ID=<required_role_ids_comma_separated>
DISCORD_CALLBACK_URL=http://localhost:16261/auth/discord/callback
DEV_LOGIN_MODE=TRUE
DEBUG_REACT=TRUE
SESSION_SECRET=<secure_random_secret>
```

## Running the App

Start servers (in the root of the project):

```bash
npm start
```

The app will then be accessible at <http://localhost:16261>

## Development Workflow

* **Frontend:** Code React components inside `fact_index/src`. Parcel automatically compiles changes.
* **Backend:** Express routes and API handlers are located under `auth/`, `router/`, and `main.js`.

### Discord OAuth

Discord authentication is handled via Passport.js:

* `/auth/discord` initiates login.
* `/auth/discord/callback` handles Discord's response.

### Dev Mode

If `DEV_LOGIN_MODE` is true, `/auth/dev/login` provides a quick development login bypass.
if `DEBUG_REACT` is true, the backend will proxy React’s development server to allow hot*reloading and development features.
Make sure the React app (typically via npm run start in fact_index/) is running on its dev port (usually 1234).

## API Routes

* **Facts CRUD:** `/api/facts`
* **Auth status:** `/auth/status`

## Contributing

* Fork the repo and create feature branches.
* Submit PRs describing your changes.

# MVP

* User Authentication (Discord OAuth + Dev login mode and Other)
* Permission Check (only authorized users can CRUD facts)
* Fact CRUD API (`/api/facts`)
* Fact Submission Form (with client-side & server-side validation)
* Fact Edit & Delete (with confirmation)
* Fact List/Search View (basic keyword search/filter)
* View Fact Detail (with source, subject, audience, etc.)
* Basic Error Handling (API and UI error messages)
* Loading Indicators (Fact list, details, forms)
* Database Schema for Facts, Roles, etc.
* Essential Logging (server-side errors)
* Session Security (CSRF protection, session secret)
* Load Config file
* Health Check Endpoint (`/sys_health`)
* Frontend/Backend integration with proxy for React Dev Server
* Remove console.log from production builds

## Future Plans

### Must Have

* Testing Coverage
* Error Logging & Monitoring
* Permission System (Backend)
* Database Schema (Finalization/Refactor)
* Error Handling Improvements (Backend & Auth)
* Throttle Login Attempts (Security)
* CSRF Handling
* Token Expiry Handling
* Fact Submission Form:
  * Field-specific error messages
  * Success feedback improvement
  * Disable submit button while saving
  * Show API/server error messages nicely
  * Client-side validation for all fields
  * Validation for Source Field
  * Delete fact (with confirmation dialog) if editing
* API error retry (FactDetail)
* Handle missing/invalid ID gracefully (FactDetail)
* Show loading spinner (FactDetail & Submission Form)
* Remove/replace console.log before production

### Should Have

* Add caching and rate limiting to API endpoints (Backend)
* Multi-language/i18n Support (React)
* Error boundary (React)
* Privacy Policy & Terms of Use pages
* Stateless Login (Auth)
* Type API Responses
* Define User Type
* Fact Submission Form:
  * Preview mode
  * Support for editing/adding Subjects and Audiences
  * PropType/TS coverage for all fields
  * Refactor: move API logic to a separate hook/service
  * Markdown or rich text support for Fact Text/Context
  * Type suggestions/autocomplete
  * Unsaved changes warning
  * Print-friendly view
* Fact Search:
  * URL state sync
  * Debounce keyword search
  * Prefetch next page
  * Keyboard navigation between filters/results
  * Stats: “123 facts found for ‘xyz’”
  * Reporting: Allow users to report/flag a fact
* FactDetail:
  * Fact context formatting
  * Show timestamps for last edit (if available)
  * Source link validation
  * Fetch error reason
* FactResultsTable:
  * Virtualization
  * Memoize rows for large lists
* SidebarFilters:
  * Debounced Filter Application
  * Memoization
  * Loading State
  * Responsive Layout

### Could Have

* SSO/Multiple Account Link (future)
* Support for “suppressed facts” (reviewed/hidden) (Fact Submission/Search/FactDetail)
* Fact Submission:
  * Show API/server error messages nicely
* FactDetail:
  * Move chip rendering to sub-component if logic grows
  * Show tooltip for long/overflowed fact text or context
  * Show suppressed facts with a clearer UI
  * Visually distinguish between “subject” and “audience” chips
  * Memoize heavy render parts if fact objects are large
* FactResultsTable:
  * Memoize rows for large lists
* SidebarFilters:
  * Saved Filters / Presets
  * Sticky Sidebar or Floating Button
  * Input Validation
  * Tooltips or Help Icons
* NavBar:
  * Provider Status for Login Buttons
  * Provider Icons for User
  * Support For User Menu
  * Loading and Error State Improvements
  * Custom Avatars/Fallbacks
  * Refactor loginProviders List
* TypeScript: Move to full TS types (React)

### Won’t Have (this time)

* Rich Text/Markdown Support for Facts (unless required for MVP, keep as a future feature)
* Full Print-friendly view for every page
* Virtualization of very large tables (until proven necessary)
* Multi-user account link management
* Full audit log UI
* Unrestricted “suppressed facts” support without review process
* Deep theming/appearance customization
* “Gamification” features or fact upvoting
* Admin UI for everything (keep admin for CLI/DB for now)
* Third-party API integration (beyond Discord)
* Support for legacy browsers
