import type { Meta, StoryObj } from "@storybook/react";
import Home from "./Home";
import { AuthContext } from "../../context/AuthContext";
import React from "react";
import { expect, within, waitFor } from "storybook/test";

const Wrapper = (
  {
    children,
    authenticated = true,
    loading = false,
  }: {
    children: React.ReactNode;
    authenticated?: boolean;
    loading?: boolean;
  }
) => {
  const mockAuthContext = {
    authenticated,
    loading,
    user: authenticated
      ? {
          id: "123",
          username: "testuser",
          avatar: null,
        }
      : null,
    login: () => {},
    logout: () => {},
  };

  return (
    <AuthContext.Provider value={mockAuthContext as any}>
      {children}
    </AuthContext.Provider>
  );
};

const meta: Meta<typeof Home> = {
  title: "Pages/Home",
  component: Home,
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
type Story = StoryObj<typeof Home>;

export const Authenticated: Story = {
  decorators: [
    (Story) => (
      <Wrapper authenticated={true}>
        <Story />
      </Wrapper>
    ),
  ],
  render: () => <Home />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      const heading = canvasElement.querySelector("h1");
      expect(heading?.textContent).toContain("FACT");
    }, { timeout: 2000 });
  },
};

export const Unauthenticated: Story = {
  decorators: [
    (Story) => (
      <Wrapper authenticated={false}>
        <Story />
      </Wrapper>
    ),
  ],
  render: () => <Home />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(canvasElement.textContent).toBeTruthy();
    }, { timeout: 2000 });
  },
};

export const Loading: Story = {
  decorators: [
    (Story) => {
      const mockAuthContext = {
        authenticated: false,
        loading: true,
        user: null,
        login: () => {},
        logout: () => {},
      };

      return (
        <AuthContext.Provider value={mockAuthContext as any}>
          <Story />
        </AuthContext.Provider>
      );
    },
  ],
  render: () => <Home />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(canvasElement).toBeInTheDocument();
    }, { timeout: 2000 });
  },
};

export const WithCustomUsername: Story = {
  decorators: [
    (Story) => {
      const mockAuthContext = {
        authenticated: true,
        loading: false,
        user: {
          id: "456",
          username: "advocateAdmin",
          avatar: null,
        },
        login: () => {},
        logout: () => {},
      };

      return (
        <AuthContext.Provider value={mockAuthContext as any}>
          <Story />
        </AuthContext.Provider>
      );
    },
  ],
  render: () => <Home />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(canvasElement.textContent).toContain("advocateAdmin");
    }, { timeout: 2000 });
  },
};
