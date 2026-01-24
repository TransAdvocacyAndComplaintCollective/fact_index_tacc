import React from "react";
import PropTypes from "prop-types";
import { Stack } from "@mantine/core";
import FactResultRow from "./FactResultRow";
import * as styles from "./FactResultsTable.module.scss";

export default function FactResultsTable({ facts, onRowClick, selectedFact }) {
  return (
    <Stack gap="sm" role="list">
      {facts.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          color: 'var(--mantine-color-gray-5)',
          fontSize: '1rem'
        }}>
          No facts found.
        </div>
      ) : (
        facts.map((fact, idx) => {
          const isSelected = selectedFact?.id === fact.id;
          return (
            <div
              key={fact.id || idx}
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
              style={{
                cursor: 'pointer',
                padding: '0.75rem',
                borderRadius: '6px',
                border: isSelected ? '2px solid var(--mantine-color-blue-6)' : '1px solid var(--mantine-color-gray-3)',
                backgroundColor: isSelected ? 'var(--mantine-color-blue-0)' : 'var(--mantine-color-gray-0)',
                transition: 'all 0.2s ease',
                boxShadow: isSelected ? '0 2px 8px rgba(59, 130, 246, 0.2)' : '0 1px 3px rgba(0,0,0,0.1)',
                outline: 'none'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--mantine-color-blue-6)';
              }}
              onBlur={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = 'var(--mantine-color-gray-3)';
                }
              }}
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
    </Stack>
  );
}

FactResultsTable.propTypes = {
  facts: PropTypes.array.isRequired,
  onRowClick: PropTypes.func.isRequired,
  selectedFact: PropTypes.object,
};
