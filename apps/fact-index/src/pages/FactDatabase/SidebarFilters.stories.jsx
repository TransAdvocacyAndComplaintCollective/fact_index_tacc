import React, { useEffect, useState } from "react";
import SidebarFilters from "./SidebarFilters";

const baseFilters = {
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

const subjectTags = [
  { id: "subj-1", name: "Data Visualization" },
  { id: "subj-2", name: "High Performance Computing" },
  { id: "subj-3", name: "AI Ethics" }
];

const audienceTags = [
  { id: "aud-1", name: "Researchers" },
  { id: "aud-2", name: "Students" },
  { id: "aud-3", name: "Technologists" }
];

const Template = (args) => {
  const [filters, setFilters] = useState(args.filters);

  useEffect(() => {
    setFilters(args.filters);
  }, [args.filters]);

  return <SidebarFilters {...args} filters={filters} setFilters={setFilters} />;
};

export const WithTags = Template.bind({});
WithTags.args = {
  filters: baseFilters,
  subjects: subjectTags,
  audiences: audienceTags
};

export const NoTags = Template.bind({});
NoTags.args = {
  filters: {
    subjects: {},
    audiences: {},
    dateFrom: "",
    dateTo: "",
    yearFrom: "",
    yearTo: "",
    keyword: ""
  },
  subjects: [],
  audiences: []
};

export default {
  title: "Fact Database/SidebarFilters",
  component: SidebarFilters
};
