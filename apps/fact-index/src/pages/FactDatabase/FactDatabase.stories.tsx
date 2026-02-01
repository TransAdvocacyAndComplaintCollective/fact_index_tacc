import type { Meta, StoryObj } from "@storybook/react";
import FactDatabase from "./FactDatabase";
import { AuthContext } from "../../context/AuthContext";
import React from "react";
import { expect, within, waitFor } from "storybook/test";

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

const meta: Meta<typeof FactDatabase> = {
  title: "Pages/FactDatabase",
  component: FactDatabase,
  decorators: [
    (Story) => (
      <Wrapper>
        <Story />
      </Wrapper>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: "Full-page component for browsing and filtering facts with infinite scroll pagination",
      },
    },
  },
  tags: ["pages", "autodocs"],
};

export default meta;
type Story = StoryObj<typeof FactDatabase>;

export const Default: Story = {
  render: () => <FactDatabase />,
  parameters: {
    a11y: {
      disable: false,
    },
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      expect(canvasElement).toBeInTheDocument();
    }, { timeout: 2000 });
  },
};

export const WithSearch: Story = {
  render: () => <FactDatabase />,
  parameters: {
    a11y: {
      disable: false,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      const searchInput = canvasElement.querySelector('input[aria-label="Keyword search"]') || canvasElement.querySelector('input[placeholder*="Search"]');
      expect(searchInput).toBeTruthy();
    }, { timeout: 2000 });
  },
};
