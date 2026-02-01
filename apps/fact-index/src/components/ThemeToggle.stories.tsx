// @ts-ignore - moduleResolution issue with @storybook/react
import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";
import ThemeToggle from "./ThemeToggle";
import { AppColorSchemeProvider } from "../lib/appColorScheme";

const meta: Meta<typeof ThemeToggle> = {
  title: "Components/ThemeToggle",
  component: ThemeToggle,
};

export default meta;
type Story = StoryObj<typeof ThemeToggle>;

function ThemeToggleWrapper() {
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>("dark");
  const toggleColorScheme = (value?: 'light' | 'dark') =>
    setColorScheme(value ?? (colorScheme === "dark" ? "light" : "dark"));

  return (
    <AppColorSchemeProvider value={{ colorScheme, toggleColorScheme }}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <ThemeToggle />
        <span>Active theme: {colorScheme}</span>
      </div>
    </AppColorSchemeProvider>
  );
}

export const Default: Story = {
  render: () => <ThemeToggleWrapper />,
};
