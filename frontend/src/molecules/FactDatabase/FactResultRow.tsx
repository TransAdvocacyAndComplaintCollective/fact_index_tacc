import React from "react";
import clsx from "clsx";
import * as styles from "./style/FactResultRow.module.scss";
import type { Fact } from "@/hooks/useFactDatabase";

/**
 * Renders a single fact result row with accessibility and programmatic names.
 */
type FactResultRowProps = {
  readonly fact: Fact;
  readonly isSelected?: boolean;
  readonly tabIndex?: number;
};
export default function FactResultRow({ fact, isSelected, tabIndex }: FactResultRowProps) {
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
  // Accessibility: Status message for suppressed
  const statusId = suppressed === true ? `fact-row-status-${fact.id ?? fact_text.replace(/\s+/g, '-').toLowerCase()}` : undefined;

  return (
    <div
      className={clsx(
        styles.factRow,
        isSelected === true ? styles.selected : undefined,
        suppressed === true && styles.suppressed
      )}
      tabIndex={tabIndex}
      aria-disabled={(suppressed ?? false) ? "true" : undefined}
      role="group"
      aria-labelledby={
        statusId != null
          ? `${statusId} fact-row-title-${String(fact.id ?? fact_text)
              .replace(/\s+/g, '-')
              .toLowerCase()}`
          : `fact-row-title-${String(fact.id ?? fact_text)
              .replace(/\s+/g, '-')
              .toLowerCase()}`
      }
      aria-describedby={statusId ?? undefined}
      style={{ outline: (isSelected ?? false) ? "2px solid var(--theme-color-focus-outline)" : undefined }}
    >
      <div className={styles.main}>
        <div className={styles.titleRow}>
          <span
            className={styles.title}
            id={`fact-row-title-${String(fact.id ?? fact_text).replace(/\s+/g, '-').toLowerCase()}`}
          >
            {fact_text}
          </span>
        </div>
        {(summary != null) && (
          <div className={styles.summary}>{summary}</div>
        )}
        <div className={styles.metaRow}>
          {(source ?? "") && (
            <span className={styles.source} aria-label="Source" >
              {source}
            </span>
          )}
          {(year != null) && (
            <span className={styles.date} title="Date published" aria-label={`Date published: ${year}`}>
              {year ? `(${year})` : ""}
            </span>
          )}
        </div>
        <div className={styles.tagsRow}>
          {subjects?.length > 0 && (
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
          {audiences?.length > 0 && (
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
          {context != null && context !== "" && (
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

