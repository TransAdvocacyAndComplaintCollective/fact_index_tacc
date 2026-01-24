import React from "react";
import FactResultRow from "./FactResultRow";

const sampleFact = {
  id: 101,
  title: "TACC hosts world-class HPC facilities",
  date: "2024-09-15T00:00:00Z",
  context: "TACC provides researchers at UT Austin and beyond with access to supercomputing resources, visualization labs, and data storage.",
  type: "Research Infrastructure",
  subject: "High Performance Computing",
  source: "TACC Official",
  sourceUrl: "https://www.tacc.utexas.edu/"
};

export default {
  title: "Fact Database/FactResultRow",
  component: FactResultRow
};

const Template = (args) => <FactResultRow {...args} />;

export const Default = Template.bind({});
Default.args = {
  fact: sampleFact,
  isSelected: false
};

export const Selected = Template.bind({});
Selected.args = {
  fact: sampleFact,
  isSelected: true
};
