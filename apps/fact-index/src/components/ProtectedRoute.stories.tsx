import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import { AuthContext, type AuthContextValue } from "../context/AuthContext";

const createAuthValue = (overrides: Partial<AuthContextValue> = {}): AuthContextValue => ({
  loading: false,
  authenticated: false,
  isAdmin: false,
  user: null,
  reason: "network_error",
  login: async () => {},
  refresh: async () => ({} as any),
  logout: async () => {},
  checkAvailable: async () => ({ available: true }),
  ...overrides,
});

const meta: Meta<typeof ProtectedRoute> = {
  title: "Components/ProtectedRoute",
  component: ProtectedRoute,
  parameters: {
    disablePreviewRouter: true,
  },
};

export default meta;
type Story = StoryObj<typeof ProtectedRoute>;

const Template = (authValue: AuthContextValue) => (
  <AuthContext.Provider value={authValue}>
    <MemoryRouter initialEntries={["/protected"]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/protected" element={<div>Protected content</div>} />
        </Route>
        <Route path="/login" element={<div>Redirected to login</div>} />
      </Routes>
    </MemoryRouter>
  </AuthContext.Provider>
);

export const WhenAuthenticated: Story = {
  render: () =>
    Template(
      createAuthValue({
        authenticated: true,
        reason: "authenticated",
      })
    ),
};

export const WhenUnauthenticated: Story = {
  render: () => Template(createAuthValue()),
};
