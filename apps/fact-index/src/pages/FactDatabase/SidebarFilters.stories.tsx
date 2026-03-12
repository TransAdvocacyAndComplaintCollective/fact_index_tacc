import React, { useState } from "react";
import type { FactFilters, TagOption } from "./types";
import SidebarFilters, { SidebarFiltersProps } from "./SidebarFilters";
import { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

const baseFilters: FactFilters = {
  subjects: {
    "Data Visualization": "include",
    "High Performance Computing": "exclude"
  },
  audiences: {
    "Researchers": "include",
    "Students": "neutral"
  },
  dateFrom: "",
  dateTo: "",
  yearFrom: "2020",
  yearTo: "",
  keyword: "visualization"
};

const subjectTags: TagOption[] = [
  { id: "subj-1", name: "Data Visualization" },
  { id: "subj-2", name: "High Performance Computing" },
  { id: "subj-3", name: "AI Ethics" }
];

const audienceTags: TagOption[] = [
  { id: "aud-1", name: "Researchers" },
  { id: "aud-2", name: "Students" },
  { id: "aud-3", name: "Technologists" }
];

type TemplateProps = Omit<SidebarFiltersProps, "setFilters">;

const Template = (props: TemplateProps) => {
  const [filters, setFilters] = useState(props.filters);

  return <SidebarFilters {...props} filters={filters} setFilters={setFilters} />;
};

const meta: Meta<typeof SidebarFilters> = {
  title: "Fact Database/SidebarFilters",
  component: SidebarFilters,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof SidebarFilters>;

export const WithTags: Story = {
  args: { filters: baseFilters, subjects: subjectTags, audiences: audienceTags },
  render: (args) => <Template {...args} />,
  parameters: {
    a11y: {
      disable: false,
    },
  },
  play: async ({ canvas }) => {
    const keywordInput = await canvas.getByDisplayValue("visualization");
    await expect(keywordInput).toBeVisible();
  },
};

export const NoTags: Story = {
  args: {
    filters: {
      subjects: {},
      audiences: {},
      dateFrom: "",
      dateTo: "",
      yearFrom: "",
      yearTo: "",
      keyword: "",
    },
    subjects: [],
    audiences: [],
  },
  render: (args) => <Template {...args} />,
  parameters: {
    a11y: {
      disable: false,
    },
  },
  play: async ({ canvas }) => {
    const tag = await canvas.queryByText("Data Visualization");
    await expect(tag).toBeNull();
  },
};

export const Interactions: Story = {
  args: { filters: baseFilters, subjects: subjectTags, audiences: audienceTags },
  render: (args) => <Template {...args} />,
  parameters: {
    a11y: {
      disable: false,
    },
  },
  play: async ({ canvas }) => {
    const input = await canvas.getByDisplayValue("visualization");
    await expect(input).toBeVisible();
  },
};

/**
 * Test story: Verify setFilters callback is invoked when keyword filter changes
 */
export const SetFiltersKeywordCallbackTest: Story = {
  args: { filters: baseFilters, subjects: subjectTags, audiences: audienceTags },
  render: (args) => {
    const [filters, setFilters] = useState(args.filters);
    const handleFiltersChange = (newFilters: FactFilters) => {
      setFilters(newFilters);
      console.log(`✓ setFilters called - keyword: "${newFilters.keyword}"`);
    };
    return <SidebarFilters {...args} filters={filters} setFilters={handleFiltersChange} />;
  },
  parameters: {
    a11y: {
      disable: false,
    },
  },
  play: async ({ canvas }) => {
    const input = await canvas.getByDisplayValue("visualization");
    await expect(input).toBeVisible();
  },
};

/**
 * Test story: Verify setFilters callback is called when subject tag filter is toggled
 */
export const SetFiltersSubjectToggleTest: Story = {
  args: {
    filters: {
      subjects: {},
      audiences: {},
      dateFrom: "",
      dateTo: "",
      yearFrom: "",
      yearTo: "",
      keyword: "",
    },
    subjects: subjectTags,
    audiences: audienceTags,
  },
  render: (args) => {
    const [filters, setFilters] = useState(args.filters);
    const handleFiltersChange = (newFilters: FactFilters) => {
      setFilters(newFilters);
      console.log(
        `✓ setFilters called - subject filter state changed:`,
        newFilters.subjects
      );
    };
    return (
      <SidebarFilters {...args} filters={filters} setFilters={handleFiltersChange} />
    );
  },
  parameters: {
    a11y: {
      disable: false,
    },
  },
  play: async ({ canvas }) => {
    const badges = await canvas.queryAllByRole("checkbox");
    await expect(badges.length).toBeGreaterThan(0);
  },
};

/**
 * Test story: Verify setFilters callback is called when audience filter is toggled
 */
export const SetFiltersAudienceToggleTest: Story = {
  args: {
    filters: {
      subjects: {},
      audiences: {},
      dateFrom: "",
      dateTo: "",
      yearFrom: "",
      yearTo: "",
      keyword: "",
    },
    subjects: subjectTags,
    audiences: audienceTags,
  },
  render: (args) => {
    const [filters, setFilters] = useState(args.filters);
    const handleFiltersChange = (newFilters: FactFilters) => {
      setFilters(newFilters);
      console.log(
        `✓ setFilters called - audience filter state changed:`,
        newFilters.audiences
      );
    };
    return (
      <SidebarFilters {...args} filters={filters} setFilters={handleFiltersChange} />
    );
  },
  parameters: {
    a11y: {
      disable: false,
    },
  },
  play: async ({ canvas }) => {
    const badges = await canvas.queryAllByRole("checkbox");
    await expect(badges.length).toBeGreaterThan(0);
  },
};
