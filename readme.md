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
│   └── passport-discord.js (Passport Discord strategy)
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
git clone <repo-url>
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

The app will then be accessible at http://localhost:16261

## Development Workflow

* **Frontend:** Code React components inside `fact_index/src`. Parcel automatically compiles changes.
* **Backend:** Express routes and API handlers are located under `auth/`, `router/`, and `main.js`.

### Discord OAuth

Discord authentication is handled via Passport.js:

* `/auth/discord` initiates login.
* `/auth/discord/callback` handles Discord's response.

### Dev Mode

If `DEV_LOGIN_MODE` is true, `/auth/dev-login` provides a quick development login bypass.
if `DEBUG_REACT` is true, the backend will proxy React’s development server to allow hot-reloading and development features.
Make sure the React app (typically via npm run start in fact_index/) is running on its dev port (usually 1234).
## API Routes

* **Facts CRUD:** `/api/facts`
* **Auth status:** `/auth/status`


## Contributing

* Fork the repo and create feature branches.
* Submit PRs describing your changes.

---

**Happy coding! 🎉**
