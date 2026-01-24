import React from "react";
import { action } from "@storybook/addon-actions";
import FactResultsTable from "./FactResultsTable";

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

export default {
  title: "Fact Database/FactResultsTable",
  component: FactResultsTable,
  args: {
    onRowClick: action("row-click")
  }
};

const Template = (args) => <FactResultsTable {...args} />;

export const Default = Template.bind({});
Default.args = {
  facts: sampleFacts,
  selectedFact: sampleFacts[1]
};

export const Empty = Template.bind({});
Empty.args = {
  facts: []
};
