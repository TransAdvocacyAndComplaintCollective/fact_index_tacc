import React from "react";
import PropTypes from "prop-types";
import FactResultRow from "./FactResultRow";
import * as styles from "./FactResultsTable.module.scss";

export default function FactResultsTable({ facts, onRowClick, selectedFact }) {
  return (
    <div className={styles.factdbResultsTable}>
      <div className={styles.factdbResults} role="list">
        {facts.length === 0 ? (
          <div className={styles.noResults}>No facts found.</div>
        ) : (
          facts.map((fact, idx) => {
            const isSelected = selectedFact?.id === fact.id;
            return (
              // THIS DIV is the "listitem" (for keyboard events, styling, and a11y)
              <div
                key={fact.id || idx}
                className={
                  isSelected
                    ? `${styles.factdbResultRow} ${styles.selected}`
                    : styles.factdbResultRow
                }
                role="listitem"
                tabIndex={0}
                aria-current={isSelected ? "true" : undefined}
                aria-label={fact.title || "Result row"}
                onClick={() => onRowClick(fact)}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRowClick(fact);
                  }
                }}
                onFocus={e => e.currentTarget.classList.add(styles.focused)}
                onBlur={e => e.currentTarget.classList.remove(styles.focused)}
                data-testid="fact-result-row"
              >
                <FactResultRow
                  fact={fact}
                  isSelected={isSelected}
                  classes={styles}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

FactResultsTable.propTypes = {
  facts: PropTypes.array.isRequired,
  onRowClick: PropTypes.func.isRequired,
  selectedFact: PropTypes.object,
};
