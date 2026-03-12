import type { Preview } from "@storybook/react";

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

import { MantineProvider } from "@mantine/core";
import mantineTheme from "../src/lib/mantineTheme";
import { Notifications } from "@mantine/notifications";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { initialize, mswLoader } from "msw-storybook-addon";
import { withThemeByDataAttribute } from "@storybook/addon-themes";
import { expect } from "storybook/test";
import { useEffect, type ReactNode } from "react";
import { getBodyLuminances, MIN_LIGHT_DARK_MARGIN } from "../src/lib/themeProbe";

// ✅ MSW: required init for Storybook addon
initialize({
  // optional, but reduces noisy console warnings for unmocked calls
  onUnhandledRequest: "bypass",
});

let cachedLightAverage: number | null = null;
let cachedDarkAverage: number | null = null;

function ThemeProbeGuard({
  children,
  theme,
}: {
  children: React.ReactNode;
  theme: "light" | "dark";
}) {
  useEffect(() => {
    const { bgLum, fgLum, average } = getBodyLuminances();

    expect(bgLum).not.toBeNaN();
    expect(fgLum).not.toBeNaN();

    if (theme === "light") {
      expect(bgLum).toBeGreaterThan(fgLum);
      expect(average).toBeGreaterThan(0.4);
      cachedLightAverage = average;
    } else {
      expect(bgLum).toBeLessThan(fgLum);
      expect(average).toBeLessThan(0.5);
      cachedDarkAverage = average;
    }

    if (cachedLightAverage != null && cachedDarkAverage != null) {
      expect(cachedLightAverage).toBeGreaterThan(cachedDarkAverage);
      expect(cachedLightAverage - cachedDarkAverage).toBeGreaterThan(MIN_LIGHT_DARK_MARGIN);
    }
  }, [theme]);

  return <>{children}</>;
}

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
        retry: 0,
      },
    },
  });

const preview: Preview = {
  decorators: [
    /**
     * ✅ Keep Mantine’s <html data-mantine-color-scheme="..."> in sync with Storybook theme.
     * Mantine uses this attribute to decide light vs dark styles.
     */
    withThemeByDataAttribute({
      themes: { light: "light", dark: "dark" },
      defaultTheme: "dark",
      attributeName: "data-mantine-color-scheme",
    }),

    (Story, context) => {
      const scheme = (context.globals.theme ?? "dark") as "light" | "dark";
      const queryClient = createQueryClient();
      const disableRouter = context.parameters?.disablePreviewRouter ?? false;
      const initialEntries = context.parameters?.initialEntries ?? ["/"];

      const content = (
        <ThemeProbeGuard theme={scheme}>
          <QueryClientProvider client={queryClient}>
            <MantineProvider theme={mantineTheme} forceColorScheme={scheme}>
              <Notifications position="top-right" />
              <Story />
            </MantineProvider>
          </QueryClientProvider>
        </ThemeProbeGuard>
      );

      if (disableRouter) {
        return content;
      }

      return <MemoryRouter initialEntries={initialEntries} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{content}</MemoryRouter>;
    },
  ],
  parameters: {
    actions: { argTypesRegex: "^on.*" },
    controls: { expanded: true },
    docs: { autodocs: "tag" },
    loaders: [mswLoader],
    a11y: { test: "error" },
  },
};

export const globalTypes = {
  theme: {
    name: "Theme",
    description: "Global theme for Mantine",
    defaultValue: "dark",
    toolbar: {
      icon: "circlehollow",
      items: [
        { value: "light", title: "Light" },
        { value: "dark", title: "Dark" },
      ],
    },
  },
};

export const initialGlobals = {
  theme: "dark",
};

export default preview;
