# Task Completion Checklist

When finishing work on this project, ensure:

## Code Quality
- [ ] All linting errors fixed: `pnpm nx run-many --targets=lint`
- [ ] Code formatted: `pnpm nx format:write`
- [ ] No unused imports: `pnpm knip` (check warnings)
- [ ] TypeScript compiles: `pnpm nx run-many --targets=check`

## Testing
- [ ] All Vitest tests pass: `pnpm vitest run`
- [ ] Story tests pass (21 story tests): `pnpm vitest` or `pnpm run test-storybook`
- [ ] a11y tests pass (11 a11y tests included)
- [ ] No console errors in Storybook: `pnpm run storybook`
- [ ] Browser tests work: `pnpm vitest run --browser`

## Storybook & Components
- [ ] All story files have `.test.tsx` wrappers
- [ ] All story files include `a11y` parameters
- [ ] Stories have `play` functions for interactive testing
- [ ] Components render correctly in light AND dark modes
- [ ] Color contrast meets WCAG AA (4.5:1 minimum)
- [ ] No hardcoded colors (use theme values instead)

## Accessibility
- [ ] Theme-aware colors applied (not hardcoded)
- [ ] `autoContrast: true` on Badge components
- [ ] Mantine theme properly configured
- [ ] Semantic HTML elements used
- [ ] ARIA labels where appropriate

## Build & Deploy
- [ ] Production build succeeds: `pnpm run build`
- [ ] No build warnings/errors
- [ ] All dependencies up to date: `pnpm install`
- [ ] Environment variables documented

## Documentation
- [ ] Comments added for complex logic
- [ ] README updated if needed
- [ ] Storybook autodocs enabled for new components
- [ ] Type definitions are clear

## Git
- [ ] Changes committed with descriptive messages
- [ ] Branch up to date with main: `git pull origin main`
- [ ] Ready for PR if needed

## Common Issues to Check
- Color contrast failing? → Remove hardcoded colors, use theme
- Story tests failing? → Ensure `.test.tsx` wrapper exists + contains tests
- Dark mode broken? → Check `mantineTheme.ts` configuration
- a11y warnings? → Check Storybook a11y addon in browser
