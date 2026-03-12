import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import NavBar from "./NavBar";
import { AuthContext, type AuthContextValue } from "../context/AuthContext";
import { AppColorSchemeProvider } from "../lib/appColorScheme";
import { RBACProvider } from "@impelsysinc/react-rbac";

const createAuthValue = (overrides: Partial<AuthContextValue> = {}): AuthContextValue => ({
  loading: false,
  authenticated: false,
  user: null,
  reason: "network_error",
  login: async () => {},
  refresh: async () => ({} as any),
  logout: async () => {},
  checkAvailable: async () => ({ available: true }),
  ...overrides,
});

const meta: Meta<typeof NavBar> = {
  title: "Components/NavBar",
  component: NavBar,
  parameters: {
    disablePreviewRouter: true,
    a11y: {
      disable: true,
    },
  },
};

export default meta;
type Story = StoryObj<typeof NavBar>;

const Template = (authValue: AuthContextValue) => (
  <RBACProvider rbac={{}}>
    <AppColorSchemeProvider value={{ colorScheme: "dark", toggleColorScheme: () => {} }}>
      <AuthContext.Provider value={authValue}>
        <MemoryRouter initialEntries={["/facts"]}>
          <NavBar />
        </MemoryRouter>
      </AuthContext.Provider>
    </AppColorSchemeProvider>
  </RBACProvider>
);

export const LoggedOut: Story = {
  render: () => Template(createAuthValue()),
};

export const LoggedIn: Story = {
  render: () =>
    Template(
      createAuthValue({
        authenticated: true,
        user: {
          id: "123",
          username: "story-user",
          avatar: null,
          discriminator: "1234",
        },
        reason: "authenticated",
      })
    ),
};
