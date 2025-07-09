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
* Yarn or npm

### Setup

1. Clone the repository:

```bash
git clone <repo-url>
cd fact_index_tacc
```

2. Install dependencies:

```bash
npm install
# or
yarn install
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
SESSION_SECRET=<secure_random_secret>
```

### Run the App

**Start backend and frontend development servers:**

```bash
npm start
# or
yarn start
```

The app runs at: [http://localhost:16261](http://localhost:16261)

### Database Setup

The project uses SQLite3 by default.

* Initialize or migrate the database:

```bash
npx knex migrate:latest
```

* (Optional) Seed database with initial data:

```bash
npx knex seed:run
```

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

## Testing

Run Jest tests:

```bash
npm test
# or
yarn test
```

## Contributing

* Fork the repo and create feature branches.
* Submit PRs describing your changes.

---

**Happy coding! 🎉**
