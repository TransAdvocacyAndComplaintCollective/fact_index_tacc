# Code Style & Conventions

## TypeScript
- **Strict mode**: Enabled in tsconfig.base.json
- **Naming conventions**:
  - Components: PascalCase (e.g., `FactDatabase.tsx`)
  - Functions/hooks: camelCase (e.g., `useSessionLoader.tsx`)
  - Types: PascalCase with `I` prefix for interfaces (e.g., `IFact`)
  - Constants: UPPER_SNAKE_CASE (e.g., `DISCORD_CALLBACK_URL`)
  - Files: PascalCase for components, camelCase for utilities

## React & Components
- **Framework**: React 19.1.0 with functional components
- **UI Library**: Mantine v8.3.13
  - Use semantic Mantine components (Button, Card, Text, Badge, etc.)
  - Leverage theme system for colors/spacing
  - Use `autoContrast` on Badge for a11y
- **Styling**: Sass modules (.module.scss)
  - Co-locate styles with components
  - Use CSS modules for scoping
  - Avoid global styles unless necessary
- **Hooks**: Custom hooks in `src/hooks/` directory
- **Context**: State management via React Context (src/context/)

## Story Files (.stories.tsx)
- **Pattern**: `ComponentName.stories.tsx`
- **Exports**:
  - Default export: Storybook Meta configuration
  - Named exports: Individual story cases
- **Accessibility**: Include `a11y` parameters in stories:
  ```tsx
  a11y: {
    disable: false  // Enable accessibility testing
  }
  ```
- **Test wrapper**: Each story file has corresponding `.test.tsx` file that:
  - Tests story meta configuration
  - Tests play function execution
  - Validates a11y parameters

## Testing
- **Framework**: Vitest 4.0.18 with jsdom environment
- **Browser Testing**: Playwright (Chromium, headless)
- **a11y Testing**: Built-in Storybook a11y addon
- **Test patterns**:
  - Story files: `*.stories.test.tsx`
  - Regular tests: `*.test.ts|tsx`
- **Setup**: Tests use `@storybook/addon-vitest/vitest-plugin`

## Theme/Dark Mode
- **Mantine Theme**: Located at `src/lib/mantineTheme.ts`
- **Key config**:
  ```typescript
  autoContrast: true  // Global setting for color contrast
  ```
- **Component colors**: Use theme-aware colors via:
  ```tsx
  color: theme.colorScheme === 'dark' ? 'gray.1' : 'dark.9'
  ```
- **Contrast**: Ensure WCAG AA standard (4.5:1 minimum)

## Linting & Formatting
- **ESLint**: Configured in eslint.config.mjs
- **Prettier**: .prettierrc configuration
- **Stylelint**: .stylelintrc.json for Sass
- **Run all**:
  ```bash
  pnpm nx run-many --targets=lint,format
  ```

## Git & Commits
- **Branch naming**: feature/*, bugfix/*, etc.
- **Current branch**: Better_UI (development)
- **Default branch**: main (production)
- **Commit messages**: Clear, descriptive (conventional commits preferred)

## Comments & Documentation
- **JSDoc**: Use for public functions/components
- **TODO comments**: Link to GitHub issues when possible
- **Type hints**: Always include TypeScript types
- **Docstrings**: Required for complex logic

## Accessibility (a11y)
- **Color contrast**: Minimum WCAG AA (4.5:1)
- **Component props**:
  - Use `autoContrast` on Badge, Button, etc.
  - Test with Storybook a11y addon
  - Play functions should test user interactions
