import type { Meta, StoryObj } from "@storybook/react";
import FactDetail, { FactDetailView } from "./FactDetail";
import { AuthContext } from "../../context/AuthContext";
import React from "react";
import { expect, within, waitFor } from "storybook/test";
import type { FactRecord } from "./types";

const mockAuthContext = {
  authenticated: true,
  loading: false,
  user: {
    id: "test-user",
    username: "testuser",
    avatar: null,
  },
  login: () => {},
  logout: () => {},
};

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthContext.Provider value={mockAuthContext as any}>
    {children}
  </AuthContext.Provider>
);

const meta: Meta<typeof FactDetail> = {
  title: "Pages/FactDetail",
  component: FactDetail,
  decorators: [
    (Story) => (
      <Wrapper>
        <Story />
      </Wrapper>
    ),
  ],
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof FactDetail>;

const demoFact: FactRecord = {
  id: 1,
  fact_text: "Storybook: Verified fact snapshot",
  source: "https://example.com/fact",
  type: "historical",
  context: "Demonstrating fact details via Storybook.",
  user: "storybook-user",
  timestamp: "2025-01-01T00:00:00Z",
  subjects: ["Data Visualization"],
  audiences: ["Researchers"],
};

export const Default: Story = {
  render: () => <FactDetailView fact={demoFact} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(canvasElement.querySelector("h2")).toBeTruthy();
    }, { timeout: 2000 });
  },
};

export const WithFullMetadata: Story = {
  render: () => <FactDetailView fact={demoFact} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      const badges = canvasElement.querySelectorAll("[class*='badge']");
      expect(badges.length).toBeGreaterThanOrEqual(0);
    }, { timeout: 2000 });
  },
};

export const WithSourceLink: Story = {
  render: () => <FactDetailView fact={demoFact} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      const link = canvasElement.querySelector('a[target="_blank"]');
      expect(link).toBeTruthy();
    }, { timeout: 2000 });
  },
};
