import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx|js|jsx|mdx)"],

  // ✅ Needed if you did `npx msw init public/` so Storybook serves the worker file
  staticDirs: ["../public"],

  addons: [
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-themes",

    "@storybook/addon-vitest",

    {
      name: "@storybook/addon-mcp",
      options: {
        toolsets: {
          dev: true,
          docs: true,
        },
        experimentalFormat: "markdown",
      },
    },
  ],

  features: {
    experimentalComponentsManifest: true,
  },

  framework: {
    name: "@storybook/react-vite",
    options: {},
  },

  async viteFinal(viteConfig) {
    viteConfig.resolve = viteConfig.resolve || {};
    const dedupe = (viteConfig.resolve.dedupe || []) as string[];

    // ✅ Dedupe React + Mantine + Emotion to avoid “multiple instances” weirdness
    // (Emotion in particular is sensitive to being loaded twice)
    viteConfig.resolve.dedupe = Array.from(
      new Set([
        ...dedupe,
        "react",
        "react-dom",
        "@mantine/core",
        "@mantine/hooks",
        "@mantine/notifications",
        "@mantine/modals",
        "@mantine/nprogress",
        "@emotion/react",
        "@emotion/styled",
        "@emotion/server",
      ])
    );

    return viteConfig;
  },
};

export default config;
