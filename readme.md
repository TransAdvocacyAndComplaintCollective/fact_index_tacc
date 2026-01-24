# Fabs Fact Database

This project provides an authenticated web app and API for managing and accessing a database of facts. It integrates Discord OAuth authentication, a React frontend, and an Express backend.

## Tech Stack

* **Frontend:** React, React Router, Nx `@nx/react` (webpack build/server)
* **Backend:** Node.js, Express, Nx `@nx/node` with Passport.js (Discord OAuth)
* **Database:** SQLite3, Knex.js
* **Styling:** Sass Modules

## Project Structure

```
.
├── apps
│   ├── fact-server (Nx Node application)
│   │   ├── src
│   │   │   ├── auth (Discord + dev auth routers)
│   │   │   ├── router (API, health, static middleware)
│   │   │   ├── db (Knex repositories + migrations)
│   │   │   ├── fallback (static fallback HTML)
│   │   │   ├── cli-load-csv.js (data import helper)
│   │   │   └── main.ts (Express entry point)
│   │   └── project.json / tsconfig (Nx config)
│   └── fact-index (Nx React application)
│       ├── src
│       │   ├── components
│       │   ├── context
│       │   ├── pages
│       │   └── style (Sass themes & mixins)
│       ├── webpack.config.js
│       └── project.json (Nx build/test targets)
├── libs (shared code, if needed by future work)
├── nx.json (workspace layout + tooling defaults)
└── package.json (npm + Nx scripts)
```

## Getting Started

### Prerequisites

* Node.js v22+
* npm

### Setup

1. Clone the repository:

```bash
git clone <repo-url>
cd fact_index_tacc
```

2. Install dependencies:

```bash
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

Start the backend API:

```bash
npm run start:server
```

Start the React front-end (runs on port 4200 by default):

```bash
npm run start:web
```

When both are running, the backend remains available at http://localhost:16261 and the UI on http://localhost:4200 (Nx dev server), or the backend proxies the built assets when you run `npm run build`.

## Development Workflow

* **Frontend:** The React SPA lives in `apps/fact-index/src`. Nx (`@nx/react` + webpack) bundles it; run `npm run start:web` to get the dev server with hot reload.
* **Backend:** Express, Passport, and route files live under `apps/fact-server/src`. Run `npm run start:server` (Nx `@nx/node`) for the API server.

### Discord OAuth

Discord authentication is handled via Passport.js:

* `/auth/discord` initiates login.
* `/auth/discord/callback` handles Discord's response.

### Dev Mode

* `DEV_LOGIN_MODE=true` provides a shortcut `/auth/dev-login` for development work.
* `DEBUG_REACT=TRUE` tells the API server to proxy the React dev server (by default at port `4200`, configurable via `REACT_DEV_SERVER_PORT`). Start the front-end via `npm run start:web` before hitting the backend.
## API Routes

* **Facts CRUD:** `/api/facts`
* **Auth status:** `/auth/status`


## Contributing

* Fork the repo and create feature branches.
* Submit PRs describing your changes.

---

**Happy coding! 🎉**
