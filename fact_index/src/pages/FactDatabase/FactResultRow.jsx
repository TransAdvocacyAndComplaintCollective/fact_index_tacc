import React from "react";
import PropTypes from "prop-types";
import clsx from "clsx";
import * as styles from "./FactResultRow.module.scss";

/**
 * Renders a single fact result row.
 */
export default function FactResultRow({ fact, isSelected }) {
  // Extract key fields for display
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

  return (
    <div
      className={clsx(
        styles.factRow,
        isSelected && styles.selected,
        suppressed && styles.suppressed
      )}
      tabIndex={-1}
      aria-disabled={suppressed ? "true" : undefined}
    >
      <div className={styles.main}>
        <div className={styles.titleRow}>
          <span className={styles.title}>{fact_text}</span>

        </div>
        {summary && (
          <div className={styles.summary}>{summary}</div>
        )}
        <div className={styles.metaRow}>
          <span className={styles.source} title="Source">{source}</span>
          {datePublished && (
            <span className={styles.date} title="Date published">
              {new Date(datePublished).toLocaleDateString()}
            </span>
          )}
          {typeof score === "number" && (
            <span className={styles.score} title="Relevance score">
              ★ {score}
            </span>
          )}
        </div>
        <div className={styles.tagsRow}>
          {subjects && subjects.length > 0 && (
            <span className={styles.chipGroup} aria-label="Subjects">
              {subjects.map(s =>
                <span className={styles.chip} key={s}>{s}</span>
              )}
            </span>
          )}
          {audiences && audiences.length > 0 && (
            <span className={styles.chipGroup} aria-label="Audiences">
              {audiences.map(a =>
                <span className={clsx(styles.chip, styles.audience)} key={a}>{a}</span>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

FactResultRow.propTypes = {
  fact: PropTypes.object.isRequired,
  isSelected: PropTypes.bool,
};
