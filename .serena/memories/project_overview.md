# FACT INDEX TACC - Project Overview

## Project Purpose
A collaborative web application and API for managing and accessing a database of facts supporting transparent advocacy. Features Discord OAuth authentication, a React frontend, and an Express backend with SQLite database.

## Tech Stack

### Frontend
- **React** 19.1.0 - UI framework
- **React Router** 6.22.0 - Client-side routing
- **Mantine** 8.3.13 - React component library
- **Vitest** 4.0.18 - Testing framework
- **Storybook** 10.2.0 - Component documentation & testing
- **Sass** 1.89.2 - Styling with modules

### Backend
- **Express** 5.2.1 - Web framework
- **Node.js** v22+ - Runtime
- **Passport.js** - Discord OAuth authentication
- **Kysely** 0.28.10 - Type-safe SQL query builder
- **Better SQLite3** 12.6.2 - Database driver

### Build & Tooling
- **Nx** 22.3.3 - Monorepo management
- **Vite** 7.3.1 - Module bundler
- **TypeScript** 5.9.3 - Type safety
- **pnpm** - Package manager (workspaces)
- **ESLint** 9.8.0 - Code linting
- **Playwright** - Browser testing

## Code Structure
```
fact_index_tacc/
├── apps/
│   ├── fact-index/      # React SPA frontend
│   │   └── src/
│   │       ├── pages/       (Home, FactDatabase, login)
│   │       ├── components/  (UI components)
│   │       ├── hooks/       (Custom React hooks)
│   │       └── lib/         (Utilities & themes)
│   ├── fact-server/     # Express API backend
│   │   └── src/
│   │       ├── auth/        (Discord & dev auth)
│   │       ├── router/      (API routes)
│   │       ├── db/          (Kysely repositories)
│   │       └── logger.ts
│   └── script/          # Data import utilities
├── libs/
│   ├── types/           # Shared TypeScript types
│   └── db-core/         # Database core utilities
├── agent-ui/            # Secondary UI (Next.js based)
└── .storybook/          # Storybook configuration
```

## Key Features
- Discord OAuth authentication
- Light/Dark mode theme support with Mantine
- Fact CRUD operations via REST API
- Component testing with Storybook + Vitest
- Accessibility (a11y) testing integrated
- SQLite persistence
- Dev mode for local testing

## Branch Information
- **Current**: Better_UI
- **Default**: main
- Repo: TransAdvocacyAndComplaintCollective/fact_index_tacc
