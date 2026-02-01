# Theme & Screenshot Summary

- Screenshots captured (saved under `.playwright-mcp/`):
  - `factresultrow-default-light.png`
  - `factresultrow-selected-light.png`
  - `factresultrow-withsource-light.png`
  - `factresultrow-default-dark-final.png`
  - `factresultstable-default-light.png`
  - `factresultstable-default-dark.png`
  - `sidebarfilters-light.png`
  - `sidebarfilters-dark.png`
  - `app-home-light.png`
  - `app-home-dark.png`
  - `app-facts-light.png`
  - `app-facts-dark.png`

- Issues observed so far:
  - Storybook preview initially inconsistent with toolbar theme due to duplicate Mantine/Emotion instances; fixed by adding `resolve.dedupe` and using MantineProvider-only preview.
  - App runtime error: missing `ColorSchemeProvider` export from Mantine bundle — worked around by adding a local `AppColorSchemeProvider` and switching `ThemeToggle` to use local hook.
  - `SidebarFilters` docs view initially reported "Couldn't find story matching..." for the direct story path; the Docs view loads and Stories list entries are present.
  - Some play-run warnings (deprecated props) and occasional DOM rendering verbosity; no blocking test failures for the stories captured.

- Next steps suggested:
  - Run pixel diffs between app screenshots and corresponding Storybook screenshots.
  - Tackle visual mismatches by extending `mantineTheme` (Card, background, text colors) and adjusting component styles.

Timestamp: 2026-01-27
