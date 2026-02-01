import React from "react";
import FactResultRow, { FactResultRowFact } from "./FactResultRow";
import { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

const sampleFact: FactResultRowFact = {
  id: 101,
  title: "TACC hosts world-class HPC facilities",
  date: "2024-09-15T00:00:00Z",
  context: "TACC provides researchers at UT Austin and beyond with access to supercomputing resources, visualization labs, and data storage.",
  type: "Research Infrastructure",
  subject: "High Performance Computing",
  source: "TACC Official",
  sourceUrl: "https://www.tacc.utexas.edu/"
};

const meta: Meta<typeof FactResultRow> = {
  title: "Fact Database/FactResultRow",
  component: FactResultRow,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof FactResultRow>;

export const Default: Story = {
  args: { fact: sampleFact },
  parameters: {
    a11y: {
      disable: false,
    },
  },
  play: async ({ canvas }) => {
    const title = await canvas.getByText(sampleFact.title);
    await expect(title).toBeVisible();
  },
};

export const Selected: Story = {
  args: { fact: sampleFact, isSelected: true },
  parameters: {
    a11y: {
      disable: false,
    },
  },
  play: async ({ canvas }) => {
    const title = await canvas.getByText(sampleFact.title);
    await expect(title).toBeVisible();
  },
};

export const WithSourceLink: Story = {
  args: { fact: sampleFact },
  parameters: {
    a11y: {
      disable: false,
    },
  },
  play: async ({ canvas }) => {
    const linkText = sampleFact.source || "";
    const link = await canvas.getByText(linkText);
    await expect(link).toBeVisible();
  },
};
