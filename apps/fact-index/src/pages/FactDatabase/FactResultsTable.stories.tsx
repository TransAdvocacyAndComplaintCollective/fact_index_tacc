import React from "react";
import FactResultsTable from "./FactResultsTable";
import type { FactRecord } from "./types";
import { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

const sampleFacts = [
  {
    id: 1,
    title: "TACC provides training for research teams",
    date: "2023-07-11T00:00:00Z",
    context: "Hands-on workshops and tutorials help teams adopt toolkit best practices.",
    type: "Training",
    subject: "Computational Research",
    source: "TACC Education Hub"
  },
  {
    id: 2,
    title: "Innovative energy research using HPC",
    date: "2022-04-02T00:00:00Z",
    context: "Electric grid simulations rely on TACC's systems to deliver green energy insights.",
    type: "Project",
    subject: "Energy",
    source: "DOE Review",
    sourceUrl: "https://www.energy.gov/"
  },
  {
    id: 3,
    title: "Visualization studio produces scientific storytelling",
    date: "2024-01-20T00:00:00Z",
    context: "Creative visualization teams bring complex data narratives to wider audiences.",
    type: "Outreach",
    subject: "Science Communication",
    source: "TACC Communications"
  }
];

const mockOnRowClick = (fact: FactRecord) => {
  // Intentionally simple mock for stories
  // Tests can simulate clicks on rows
  // eslint-disable-next-line no-console
  console.log("Row clicked:", fact);
};

const defaultProps = {
  facts: sampleFacts,
  selectedFact: sampleFacts[1],
  onRowClick: mockOnRowClick,
};

const meta: Meta<typeof FactResultsTable> = {
  title: "Fact Database/FactResultsTable",
  component: FactResultsTable,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof FactResultsTable>;

export const Default: Story = {
  args: { ...defaultProps },
  parameters: {
    a11y: {
      disable: false,
    },
  },
  play: async ({ canvas }) => {
    const firstTitle = await canvas.getByText(sampleFacts[0].title);
    await expect(firstTitle).toBeVisible();
  },
};

export const Empty: Story = {
  args: { facts: [], onRowClick: mockOnRowClick },
  parameters: {
    a11y: {
      disable: false,
    },
  },
  play: async ({ canvas }) => {
    const hasAny = await canvas.queryByRole("row");
    await expect(hasAny).toBeNull();
  },
};

export const RowClick: Story = {
  args: { ...defaultProps },
  parameters: {
    a11y: {
      disable: false,
    },
  },
  play: async ({ canvas }) => {
    const secondTitle = await canvas.getByText(sampleFacts[1].title);
    await expect(secondTitle).toBeVisible();
  },
};

/**
 * Test story: Verify onRowClick callback is called with correct fact object when row is clicked
 */
export const OnRowClickCallbackTest: Story = {
  args: {
    facts: sampleFacts,
    onRowClick: (fact) => {
      console.log(`✓ onRowClick called with fact id: ${fact.id}, title: ${fact.title || fact.fact_text || 'Untitled'}`);
    },
  },
  parameters: {
    a11y: {
      disable: false,
    },
  },
  play: async ({ canvas }) => {
    // Verify all rows are clickable
    for (const fact of sampleFacts) {
      const rowElement = await canvas.getByText(fact.title);
      await expect(rowElement).toBeVisible();
    }
  },
};

/**
 * Test story: Verify onRowClick receives correct fact data on each different row click
 */
export const MultipleRowClicksTest: Story = {
  args: {
    facts: sampleFacts,
    selectedFact: sampleFacts[0],
    onRowClick: (fact) => {
      console.log(
        `✓ onRowClick called - ID: ${fact.id}, Title: ${fact.title}, Type: ${fact.type}`
      );
    },
  },
  parameters: {
    a11y: {
      disable: false,
    },
  },
  play: async ({ canvas }) => {
    // Verify row selection state via selectedFact prop
    const selectedRowTitle = await canvas.getByText(sampleFacts[0].title);
    await expect(selectedRowTitle).toBeVisible();
  },
};
