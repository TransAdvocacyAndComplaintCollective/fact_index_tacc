import type { Preview } from "@storybook/react";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../src/index.scss";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      cacheTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: 0,
      dedupingInterval: 5000
    }
  }
});

const preview: Preview = {
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <MantineProvider withGlobalStyles withNormalizeCSS>
          <Notifications position="top-right" />
          <Story />
        </MantineProvider>
      </QueryClientProvider>
    )
  ],
  parameters: {
    actions: { argTypesRegex: "^on.*" },
    controls: { expanded: true },
    docs: { autodocs: "tag" }
  }
};

export default preview;
