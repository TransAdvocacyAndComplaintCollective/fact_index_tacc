// @ts-ignore - moduleResolution issue with @storybook/react
import type { Meta, StoryObj } from "@storybook/react";
import Login from "./login";
import React from "react";
import { AuthContext } from "../../context/AuthContext";
import type { AuthContextValue } from "../../context/useAuth";
import type { QueryObserverResult } from "@tanstack/react-query";
import type { AuthStatusResponse } from "../../context/useAuth";

const meta: Meta = {
  title: "Pages/Login",
  component: Login as any,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

const defaultProvider = [
  {
    name: "Discord",
    url: "/auth/discord",
    available: true,
  },
];

const baseAuthValue: AuthContextValue = {
  loading: false,
  authenticated: false,
  user: null,
  reason: null,
  login: async () => undefined,
  refresh: async () => ({} as QueryObserverResult<AuthStatusResponse>),
  logout: async () => undefined,
  checkAvailable: async () => ({ available: true, providers: defaultProvider }),
  authAvailable: true,
  providerOptions: defaultProvider,
  errorReason: null,
  reasonCode: null,
  userMessage: null,
  showHelp: false,
  helpToggle: () => {},
};

const createAuthValue = (overrides: Partial<AuthContextValue> = {}): AuthContextValue => ({
  ...baseAuthValue,
  ...overrides,
});

const withAuthProvider = (value: AuthContextValue, children: React.ReactNode) => (
  <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
);

export const Default: Story = {
  render: () => withAuthProvider(createAuthValue(), <Login />),
  parameters: {
    a11y: {
      disable: false,
    },
    docs: {
      description: {
        story: "Shows the default login page with Discord OAuth provider available.",
      },
    },
  },
};

export const AuthUnavailable: Story = {
  render: () => withAuthProvider(createAuthValue({ authAvailable: false }), <Login />),
  parameters: {
    a11y: {
      disable: false,
    },
  },
};

export const AuthFailedMissingRole: Story = {
  render: () =>
    withAuthProvider(
      createAuthValue({
        authAvailable: true,
        errorReason: "missing_role",
        userMessage: "You must have the required Discord role to access this server.",
        reasonCode: "missing_role",
      }),
      <Login />
    ),
  parameters: {
    a11y: {
      disable: false,
    },
    docs: {
      description: {
        story:
          "Shows login failure when user doesn't have the required Discord role. In a real scenario, this would display after a failed authentication attempt due to missing role permissions.",
      },
    },
  },
};

export const HelpPanelOpen: Story = {
  render: () =>
    withAuthProvider(
      createAuthValue({
        authAvailable: true,
        showHelp: true,
        errorReason: "not_in_server",
        reasonCode: "missing_role",
      }),
      <Login />
    ),
  parameters: {
    a11y: {
      disable: false,
    },
    docs: {
      description: {
        story: "Demonstrates the login page with help information displayed. This helps users understand how to troubleshoot access issues.",
      },
    },
  },
};

export const LoginPageResponsive: Story = {
  render: () => withAuthProvider(createAuthValue(), <Login />),
  parameters: {
    a11y: {
      disable: false,
    },
    viewport: {
      defaultViewport: "mobile1",
    },
    docs: {
      description: {
        story:
          "Shows how the login page responds on mobile devices (375px width). The form maintains usability on small screens.",
      },
    },
  },
};
