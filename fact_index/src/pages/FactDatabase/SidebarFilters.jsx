import React from "react";
import PropTypes from "prop-types";
import Button from "../../atoms/Button";
import * as styles from "./SidebarFilters.module.scss";
import TriButton from "../../atoms/TriButton";

// Utility: generate a tri-state map for chip display from include/exclude arrays
function getChipStates(items, include = [], exclude = []) {
  const states = {};
  (items || []).forEach(item => {
    const name = typeof item === "string" ? item : item.name;
    if (include.includes(name)) states[name] = "include";
    else if (exclude.includes(name)) states[name] = "exclude";
    else states[name] = "neutral";
  });
  return states;
}

export default function SidebarFilters({
  filters,
  setFilters,
  subjects,
  audiences,
  subjectsInclude,
  subjectsExclude,
  audiencesInclude,
  audiencesExclude,
  onFiltersChange,
  onApplyFilters,
}) {
  // CHIP CHANGE HANDLER for Include/Exclude (subjects/audiences)
  function handleTriChipChange(fieldInclude, fieldExclude, value, nextState) {
    setFilters((f) => {
      // current values or fallback to defaults
      const inc = (f[fieldInclude] || []);
      const exc = (f[fieldExclude] || []);
      let newInclude = [...inc];
      let newExclude = [...exc];

      // remove from both arrays
      newInclude = newInclude.filter(v => v !== value);
      newExclude = newExclude.filter(v => v !== value);

      if (nextState === "include") newInclude.push(value);
      if (nextState === "exclude") newExclude.push(value);
      // Neutral: already removed

      const updatedFilters = {
        ...f,
        [fieldInclude]: newInclude,
        [fieldExclude]: newExclude,
      };
      if (onFiltersChange) onFiltersChange(updatedFilters);
      return updatedFilters;
    });
  }

  // Renders one row of chips with tri-state (for Include/Exclude per group)
  function renderTriChips(items, chipStates, fieldInclude, fieldExclude) {
    return (
      <div className={styles.chipRow}>
        {(items || []).map(item => {
          const name = typeof item === "string" ? item : item.name;
          const id = typeof item === "object" && item.id ? item.id : name;
          const state = chipStates[name] || "neutral";
          return (
            <TriButton
              key={id}
              label={name}
              state={state}
              onChange={nextState => handleTriChipChange(fieldInclude, fieldExclude, name, nextState)}
            />
          );
        })}
      </div>
    );
  }

  // Year change handler
  function handleYearChange(field, value) {
    setFilters((f) => {
      const updatedFilters = { ...f, [field]: value };
      if (onFiltersChange) onFiltersChange(updatedFilters);
      return updatedFilters;
    });
  }

  // Apply Filters button
  function handleApplyFilters() {
    if (onApplyFilters) onApplyFilters(filters);
    setFilters((f) => ({ ...f }));
  }

  // Accessibility IDs
  const yearFromId = "sidebar-year-from";
  const yearToId = "sidebar-year-to";
  const subjectsLabelId = "subjects-label";
  const audiencesLabelId = "audiences-label";

  // Prepare chip state maps from props for each group
  const subjectChipStates = getChipStates(subjects, subjectsInclude, subjectsExclude);
  // eslint-disable-next-line no-undef
  const audienceChipStates = getChipStates(audiences, audiencesInclude, audiencesExclude);

  return (
    <div className={styles.sidebarFilters} aria-label="Filters">
      <h4>Filters</h4>

      {/* Subjects */}
      <div className={styles.filterSection}>
        <div id={subjectsLabelId} className={styles.filterLabel}>
          Subject
        </div>
        {renderTriChips(subjects, subjectChipStates, "subjectsInclude", "subjectsExclude")}
      </div>

      {/* Audiences */}
      <div className={styles.filterSection}>
        <div id={audiencesLabelId} className={styles.filterLabel}>
          Audience
        </div>
        {renderTriChips(audiences, audienceChipStates, "audiencesInclude", "audiencesExclude")}
      </div>

      {/* Year */}
      <div className={`${styles.filterSection} ${styles.filterYears}`}>
        <div className={styles.filterLabel}>Year</div>
        <label htmlFor={yearFromId}>
          From:{" "}
          <input
            id={yearFromId}
            type="number"
            min="1900"
            max={new Date().getFullYear()}
            value={filters.yearFrom || ""}
            placeholder="YYYY"
            onChange={e => handleYearChange("yearFrom", e.target.value)}
            inputMode="numeric"
            aria-label="Year from"
          />
        </label>
        <label htmlFor={yearToId}>
          To:{" "}
          <input
            id={yearToId}
            type="number"
            min="1900"
            max={new Date().getFullYear()}
            value={filters.yearTo || ""}
            placeholder="YYYY"
            onChange={e => handleYearChange("yearTo", e.target.value)}
            inputMode="numeric"
            aria-label="Year to"
          />
        </label>
      </div>

      {/* Apply Filters Button */}
      <Button
        type="button"
        className={styles.applyButton}
        onClick={handleApplyFilters}
      >
        Apply Filters
      </Button>
    </div>
  );
}
SidebarFilters.defaultProps = {
  subjectsInclude: [],
  subjectsExclude: [],
  audiencesInclude: [],
  audiencesExclude: [],
  onFiltersChange: undefined,
  onApplyFilters: undefined,
  audiencesExclude: PropTypes.array,
  onFiltersChange: PropTypes.func,
  onApplyFilters: PropTypes.func,
};
// Ensure all props are typed correctly