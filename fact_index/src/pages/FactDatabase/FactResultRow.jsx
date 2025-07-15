import React from "react";
import PropTypes from "prop-types";
import clsx from "clsx";
import * as styles from "./FactResultRow.module.scss";

/**
 * Renders a single fact result row with accessibility and programmatic names.
 */
export default function FactResultRow({ fact, isSelected }) {
  const {
    fact_text,
    summary,
    year,
    source,
    subjects,
    audiences,
    suppressed,
    context,
  } = fact;
  console.log("FactResultRow", fact);
  // Accessibility: Status message for suppressed
  const statusId = suppressed ? `fact-row-status-${fact.id || fact_text.replace(/\s+/g, '-').toLowerCase()}` : undefined;

  return (
    <div
      className={clsx(
        styles.factRow,
        isSelected && styles.selected,
        suppressed && styles.suppressed
      )}
      tabIndex={suppressed ? -1 : 0}
      aria-disabled={suppressed ? "true" : undefined}
      role="group"
      aria-labelledby={statusId ? `${statusId} fact-row-title-${fact.id || fact_text.replace(/\s+/g, '-').toLowerCase()}` : `fact-row-title-${fact.id || fact_text.replace(/\s+/g, '-').toLowerCase()}`}
      aria-describedby={statusId}
      style={{ outline: isSelected ? "2px solid var(--theme-color-focus-outline)" : undefined }}
    >
      <div className={styles.main}>
        <div className={styles.titleRow}>
          <span
            className={styles.title}
            id={`fact-row-title-${fact.id || fact_text.replace(/\s+/g, '-').toLowerCase()}`}
          >
            {fact_text}
          </span>
        </div>
        {summary && (
          <div className={styles.summary}>{summary}</div>
        )}
        <div className={styles.metaRow}>
          {source && (
            <span className={styles.source} label="Source" >
              {source}
            </span>
          )}
          {year && (
            <span className={styles.date} title="Date published" aria-label={`Date published: ${year}`}>
              {year ? `(${year})` : ""}
            </span>
          )}
        </div>
        <div className={styles.tagsRow}>
          {subjects && subjects.length > 0 && (
            <span
              className={styles.chipGroup}
              aria-label="Subjects"
              role="list"
            >
              {subjects.map(s =>
                <span
                  className={styles.chip}
                  key={s}
                  role="listitem"
                  aria-label={s}
                >
                  {s}
                </span>
              )}
            </span>
          )}
          {audiences && audiences.length > 0 && (
            <span
              className={styles.chipGroup}
              aria-label="Audiences"
              role="list"
            >
              {audiences.map(a =>
                <span
                  className={clsx(styles.chip, styles.audience)}
                  key={a}
                  role="listitem"
                  aria-label={a}
                >
                  {a}
                </span>
              )}
            </span>
          )}
          {context && (
            <span
              className={styles.context}
              aria-label={`Context: ${context}`}
            >
              {context}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

FactResultRow.propTypes = {
  fact: PropTypes.shape({
    fact_text: PropTypes.string.isRequired,
    summary: PropTypes.string,
    datePublished: PropTypes.string,
    source: PropTypes.string,
    score: PropTypes.number,
    subjects: PropTypes.arrayOf(PropTypes.string),
    audiences: PropTypes.arrayOf(PropTypes.string),
    suppressed: PropTypes.bool,
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }).isRequired,
  isSelected: PropTypes.bool,
};

FactResultRow.defaultProps = {
  isSelected: false,
};
