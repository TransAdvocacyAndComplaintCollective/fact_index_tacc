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
    datePublished,
    source,
    score,
    subjects,
    audiences,
    suppressed,
  } = fact;

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
        {suppressed && (
          // Status message for suppressed facts (polite region for AT)
          <div
            className={styles.suppressedMessage}
            id={statusId}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            style={{ color: "var(--theme-color-accent-red2)", fontWeight: 700, marginBottom: "0.3em" }}
          >
            This fact is marked as suppressed and may not be visible to all users.
          </div>
        )}
        {summary && (
          <div className={styles.summary}>{summary}</div>
        )}
        <div className={styles.metaRow}>
          {source && (
            <span className={styles.source} label="Source" >
              {source}
            </span>
          )}
          {datePublished && (
            <span className={styles.date} title="Date published" aria-label={`Date published: ${new Date(datePublished).toLocaleDateString()}`}>
              {new Date(datePublished).toLocaleDateString()}
            </span>
          )}
          {typeof score === "number" && (
            <span className={styles.score} title="Relevance score" aria-label={`Relevance score: ${score}`}>
              ★ {score}
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
