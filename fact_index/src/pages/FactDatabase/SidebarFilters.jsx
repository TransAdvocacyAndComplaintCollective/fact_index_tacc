import React from "react";
import PropTypes from "prop-types";
import * as styles from "./SidebarFilters.module.scss";

// State cycling: neutral → include → exclude → neutral...
const nextChipState = (current) => {
  if (current === "include") return "exclude";
  if (current === "exclude") return "neutral";
  return "include";
};

function chipAriaChecked(state) {
  // For tri-state: neutral = false, include = true, exclude = mixed
  if (state === "include") return true;
  if (state === "exclude") return "mixed";
  return false;
}

export default function SidebarFilters({ filters, setFilters, subjects, audiences }) {
  // Toggle chip state for subjects/audiences filters
  function handleChipToggle(key, value) {
    setFilters((f) => {
      const current = (f[key]?.[value]) || "neutral";
      const next = nextChipState(current);
      return {
        ...f,
        [key]: {
          ...f[key],
          [value]: next,
        },
      };
    });
  }

  // Render chips (subject or audience)
  function renderChips(key, items, groupLabelId) {
    const chipStates = filters[key] || {};
    return (
      <div
        className={styles.chipRow}
        role="group"
        aria-labelledby={groupLabelId}
        // REMOVE aria-label here. Only aria-labelledby!
      >
        {items.map((item) => {
          const state = chipStates[item.name] || "neutral";
          return (
            <button
              key={item.id || item.name}
              type="button"
              className={[
                styles.chip,
                state === "neutral" && styles.chipNeutral,
                state === "include" && styles.chipInclude,
                state === "exclude" && styles.chipExclude,
              ].filter(Boolean).join(" ")}
              // Checkbox pattern for tri-state
              role="checkbox"
              aria-checked={chipAriaChecked(state)}
              aria-label={
                state === "neutral"
                  ? `${item.name}: not selected. Tap to include`
                  : state === "include"
                  ? `${item.name}: included. Tap to exclude`
                  : `${item.name}: excluded. Tap to clear`
              }
              tabIndex={0}
              onClick={() => handleChipToggle(key, item.name)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleChipToggle(key, item.name);
                }
              }}
            >
              {item.name}
              {state === "include" && (
                <span className={styles.chipMark} aria-label="Included">
                  ✔
                </span>
              )}
              {state === "exclude" && (
                <span className={styles.chipMark} aria-label="Excluded">
                  ✖
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // IDs for accessibility
  const yearFromId = "sidebar-year-from";
  const yearToId = "sidebar-year-to";
  const subjectsLabelId = "subjects-label";
  const audiencesLabelId = "audiences-label";

  return (
    <div className={styles.sidebarFilters} aria-label="Filters">
      <h4>Filters</h4>

      {/* Subjects */}
      <div className={styles.filterSection}>
        <div id={subjectsLabelId} className={styles.filterLabel}>
          Subject
        </div>
        {renderChips("subjects", subjects, subjectsLabelId)}
      </div>

      {/* Audiences */}
      <div className={styles.filterSection}>
        <div id={audiencesLabelId} className={styles.filterLabel}>
          Audience
        </div>
        {renderChips("audiences", audiences, audiencesLabelId)}
      </div>

      {/* Years */}
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
            onChange={(e) =>
              setFilters((f) => ({ ...f, yearFrom: e.target.value }))
            }
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
            onChange={(e) =>
              setFilters((f) => ({ ...f, yearTo: e.target.value }))
            }
            inputMode="numeric"
            aria-label="Year to"
          />
        </label>
      </div>

      {/* Apply Filters Button */}
      <button
        type="button"
        className={styles.applyButton}
        onClick={() => setFilters((f) => ({ ...f }))}
      >
        Apply Filters
      </button>
    </div>
  );
}

SidebarFilters.propTypes = {
  filters: PropTypes.object.isRequired,
  setFilters: PropTypes.func.isRequired,
  subjects: PropTypes.array.isRequired,
  audiences: PropTypes.array.isRequired,
};
