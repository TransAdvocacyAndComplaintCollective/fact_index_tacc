import React from "react";
import FactResultRow from "../molecules/FactDatabase/FactResultRow";
import styles from "./style/FactResultsTable.module.scss";
import type { Fact } from "../hooks/useFactDatabase";

type PropFactResultsTable = {
  tabIndex?: number;
  readonly facts: Fact[];
  readonly onRowClick: (fact: Fact) => void;
  readonly selectedFact?: Fact;
};

export default function FactResultsTable({ facts, onRowClick, selectedFact, tabIndex }: Readonly<PropFactResultsTable>) {
  return (
    <div className={styles.factdbResultsTable}>
      <div className={styles.factdbResults} role="list">
        {facts.length === 0 ? (
          <div className={styles.noResults}>No facts found.</div>
        ) : (
          facts.map((fact) => {
            const isSelected = selectedFact?.id === fact.id;
            return (
              <div
                key={fact.id}
                className={styles.factdbResultRow}
                role="listitem"
                tabIndex={tabIndex}
                aria-current={isSelected ? "true" : undefined}
                aria-label={(fact.title != null) && fact.title.trim() !== "" ? fact.title : "Result row"}
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
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

