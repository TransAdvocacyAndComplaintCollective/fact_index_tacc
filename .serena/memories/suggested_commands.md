# Essential Commands for Development

## Project Setup
```bash
# Install dependencies
pnpm install

# Setup environment variables
cp .env.example .env  # Not provided, create manually with Discord credentials

# Create .env file with:
PORT=16261
DISCORD_CLIENT_ID=<your_discord_client_id>
DISCORD_CLIENT_SECRET=<your_discord_client_secret>
DISCORD_GUILD_ID=<your_guild_id>
DISCORD_ROLE_ID=<comma_separated_role_ids>
DISCORD_CALLBACK_URL=http://localhost:16261/auth/discord/callback
DEV_LOGIN_MODE=TRUE
DEBUG_REACT=TRUE
SESSION_SECRET=<secure_random_string>
```

## Development

### Frontend (fact-index)
```bash
# Start React dev server (port 4200, hot reload)
pnpm run start:web

# Start Storybook on port 6006
pnpm run storybook

# Run Storybook tests
pnpm vitest run

# Run Storybook tests in watch mode
pnpm vitest
```

### Backend (fact-server)
```bash
# Start Express API server (port 16261)
pnpm run start:server

# Development mode with auto-reload
pnpm run dev

# Run tests
pnpm test
```

### Together
```bash
# Start both frontend and backend
pnpm nx run-many --targets=serve
```

## Building
```bash
# Build for production
pnpm run build

# Build fact-server specifically
nx build fact-server

# Build fact-index specifically
nx build fact-index
```

## Testing & Quality
```bash
# Run all tests
pnpm test

# Run Vitest (Storybook component tests)
pnpm vitest run
pnpm vitest        # watch mode

# Lint code
pnpm run lint

# Find unused files/imports
pnpm knip

# Type check
pnpm nx run-many --targets=check
```

## Useful Commands
```bash
# List all Nx projects
nx list

# Show project details
nx show project fact-index
nx show project fact-server

# Visualize project dependencies
nx graph

# Reset Nx cache
nx reset

# Clean builds
rm -rf dist/ node_modules/.nx-cache/
```

## Database
```bash
# Database location
./db/dev.sqlite3

# Data import (if needed)
node apps/script/build_db_from_sql.ts
```

## Debugging
- React Dev Tools: Browser extension recommended
- Storybook a11y testing: Built-in addon at http://localhost:6006
- Network requests: Check `/api/*` endpoints in DevTools
- Discord auth: Check `/auth/status` endpoint
