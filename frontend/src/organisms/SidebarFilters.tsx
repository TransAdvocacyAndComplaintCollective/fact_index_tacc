import React from "react";
import Button from "../atoms/Button/ButtonNative";
import * as styles from "./style/SidebarFilters.module.scss";
import type { State as TriState } from "../atoms/Button/TriButton";
import TriButton from "../atoms/Button/TriButton";
import type { UseFactDatabaseFilters } from "../hooks/useFactDatabase";

interface SubjectOrAudience {
  id: number | string;
  name: string;
}

interface SidebarFiltersProps {
  readonly filters: UseFactDatabaseFilters;
  readonly setFilters: React.Dispatch<React.SetStateAction<UseFactDatabaseFilters>>;
  readonly subjects: SubjectOrAudience[] | undefined | null;
  readonly audiences: SubjectOrAudience[] | undefined | null;
  readonly onFiltersChange?: (filters: UseFactDatabaseFilters) => void;
  readonly onApplyFilters?: (filters: UseFactDatabaseFilters) => void;
}

type FieldName = keyof UseFactDatabaseFilters;

function getChipStates(
  items: SubjectOrAudience[] = [],
  include: string[] = [],
  exclude: string[] = []
): Record<string, TriState> {
  const states: Record<string, TriState> = {};
  if (!Array.isArray(items)) return states;
  items.forEach((item) => {
    const name = item.name;
    if (include.includes(name)) states[name] = "include";
    else if (exclude.includes(name)) states[name] = "exclude";
    else states[name] = "neutral";
  });
  return states;
}

const SORT_OPTIONS = [
  { value: "date", label: "Date Added" },
  { value: "year", label: "Year (Fact)" },
  { value: "name", label: "Fact Text (A-Z)" },
  { value: "relevance", label: "Relevance (Keyword)" },
] as const;

const SORT_DIRECTIONS = [
  { value: "desc", label: "Descending" },
  { value: "asc", label: "Ascending" },
] as const;

export default function SidebarFilters({
  filters,
  setFilters,
  subjects,
  audiences,
  onFiltersChange,
  onApplyFilters,
}: SidebarFiltersProps) {
  // --- Defensive fallback: always arrays ---
  const safeSubjects = Array.isArray(subjects) ? subjects : [];
  const safeAudiences = Array.isArray(audiences) ? audiences : [];

  function handleTriChipChange(
    fieldInclude: FieldName,
    fieldExclude: FieldName,
    value: string,
    nextState: TriState
  ) {
    setFilters((prev) => {
      const inc = (prev[fieldInclude] as string[] | undefined) ?? [];
      const exc = (prev[fieldExclude] as string[] | undefined) ?? [];
      const newInclude = inc.filter((v) => v !== value);
      const newExclude = exc.filter((v) => v !== value);

      if (nextState === "include") newInclude.push(value);
      if (nextState === "exclude") newExclude.push(value);

      const updated: UseFactDatabaseFilters = {
        ...prev,
        [fieldInclude]: newInclude,
        [fieldExclude]: newExclude,
      };
      if (onFiltersChange) onFiltersChange(updated);
      return updated;
    });
  }

  function renderTriChips(
    items: SubjectOrAudience[] | undefined | null,
    chipStates: Record<string, TriState>,
    fieldInclude: FieldName,
    fieldExclude: FieldName,
    groupLabelId: string
  ) {
    // Defensive fallback to avoid .map on non-array
    if (!Array.isArray(items) || items.length === 0) {
      return <div className={styles.chipRow} role="group" aria-labelledby={groupLabelId} />;
    }
    return (
      <div className={styles.chipRow} role="group" aria-labelledby={groupLabelId}>
        {items.map((item) => {
          const name = item.name;
          const id = item.id;
          const state = chipStates[name] ?? "neutral";
          return (
            <TriButton
              key={id}
              label={name}
              state={state}
              onChange={(nextState) =>
                handleTriChipChange(fieldInclude, fieldExclude, name, nextState)
              }
            />
          );
        })}
      </div>
    );
  }

  function handleYearChange(field: "yearFrom" | "yearTo", value: string) {
    const intVal = value ? parseInt(value, 10) : undefined;
    setFilters((prev) => {
      const updated = { ...prev, [field]: intVal };
      if (onFiltersChange) onFiltersChange(updated);
      return updated;
    });
  }

  function handleSortByChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value as UseFactDatabaseFilters["sortBy"];
    setFilters((prev) => ({ ...prev, sortBy: value }));
  }

  function handleSortOrderChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value as UseFactDatabaseFilters["sortOrder"];
    setFilters((prev) => ({ ...prev, sortOrder: value }));
  }

  function handleApplyFilters() {
    if (onApplyFilters) onApplyFilters(filters);
    setFilters((prev) => ({ ...prev }));
  }

  // --- Accessibility IDs ---
  const yearFromId = "sidebar-year-from";
  const yearToId = "sidebar-year-to";
  const subjectsLabelId = "sidebar-label-subjects";
  const audiencesLabelId = "sidebar-label-audiences";
  const yearsGroupId = "sidebar-label-years";
  const sortById = "sidebar-sortby";
  const sortOrderId = "sidebar-sortorder";

  // --- Tri-state maps ---
  const subjectChipStates = getChipStates(
    safeSubjects,
    filters.subjectsInclude ?? [],
    filters.subjectsExclude ?? []
  );
  const audienceChipStates = getChipStates(
    safeAudiences,
    filters.audiencesInclude ?? [],
    filters.audiencesExclude ?? []
  );

  return (
    <aside className={styles.sidebarFilters} aria-label="Filters">
      <h2 id="sidebar-filters-heading">Filters</h2>

      {/* --- SORT BY --- */}
      <div className={styles.filterSection}>
        <label htmlFor={sortById} className={styles.filterLabel}>
          Sort By
        </label>
        <select
          id={sortById}
          className={styles.selectInput}
          value={filters.sortBy ?? "date"}
          onChange={handleSortByChange}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <label htmlFor={sortOrderId} className={styles.filterLabel} style={{ marginTop: 8 }}>
          Direction
        </label>
        <select
          id={sortOrderId}
          className={styles.selectInput}
          value={filters.sortOrder ?? "desc"}
          onChange={handleSortOrderChange}
        >
          {SORT_DIRECTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Subjects */}
      <div className={styles.filterSection}>
        <div id={subjectsLabelId} className={styles.filterLabel}>
          Subject
        </div>
        {renderTriChips(
          safeSubjects,
          subjectChipStates,
          "subjectsInclude",
          "subjectsExclude",
          subjectsLabelId
        )}
      </div>

      {/* Audiences */}
      <div className={styles.filterSection}>
        <div id={audiencesLabelId} className={styles.filterLabel}>
          Audience
        </div>
        {renderTriChips(
          safeAudiences,
          audienceChipStates,
          "audiencesInclude",
          "audiencesExclude",
          audiencesLabelId
        )}
      </div>

      {/* Year Range */}
      <fieldset
        className={`${styles.filterSection} ${styles.filterYears}`}
        aria-labelledby={yearsGroupId}
      >
        <legend id={yearsGroupId} className={styles.filterLabel}>
          Year
        </legend>
        <label htmlFor={yearFromId}>
          From:{" "}
          <input
            id={yearFromId}
            type="number"
            min={1900}
            max={new Date().getFullYear()}
            value={filters.yearFrom ?? ""}
            placeholder="YYYY"
            onChange={(e) => handleYearChange("yearFrom", e.target.value)}
            inputMode="numeric"
            aria-labelledby={`${yearsGroupId} ${yearFromId}-label`}
          />
          <span id={`${yearFromId}-label`} className="sr-only">
            Year from
          </span>
        </label>
        <label htmlFor={yearToId}>
          To:{" "}
          <input
            id={yearToId}
            type="number"
            min={1900}
            max={new Date().getFullYear()}
            value={filters.yearTo ?? ""}
            placeholder="YYYY"
            onChange={(e) => handleYearChange("yearTo", e.target.value)}
            inputMode="numeric"
            aria-labelledby={`${yearsGroupId} ${yearToId}-label`}
          />
          <span id={`${yearToId}-label`} className="sr-only">
            Year to
          </span>
        </label>
      </fieldset>

      {/* Apply Filters Button */}
      <Button
        type="button"
        className={styles.applyButton}
        onClick={handleApplyFilters}
        aria-label="Apply filters"
      >
        Apply Filters
      </Button>
    </aside>
  );
}
