import React, { type KeyboardEvent } from "react";
import { Stack } from "@mantine/core";
import FactResultRow from "./FactResultRow";
import type { FactRecord } from "./types";

export interface FactResultsTableProps {
  facts: FactRecord[];
  onRowClick: (fact: FactRecord) => void;
  selectedFact?: FactRecord | null;
}

export default function FactResultsTable({
  facts,
  onRowClick,
  selectedFact = null,
}: FactResultsTableProps) {
  // Filter out facts with no meaningful content
  const validFacts = facts.filter(fact => 
    fact.title || fact.fact_text || fact.context || fact.type || fact.subject || fact.source
  );

  return (
    <Stack gap="sm" component="ul" role="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {validFacts.length === 0 ? (
        <li key="empty">No facts found.</li>
      ) : (
        validFacts.map((fact, idx) => {
          const isSelected = selectedFact?.id === fact.id;
          return (
            <li key={fact.id || idx}>
              <button
                type="button"
                aria-current={isSelected ? "true" : undefined}
                aria-label={fact.title || fact.fact_text || "Result row"}
                onClick={() => onRowClick(fact)}
                onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRowClick(fact);
                  }
                }}
                data-testid="fact-result-row"
                style={{ background: "none", border: "none", width: "100%", textAlign: "left", cursor: "pointer", padding: 0 }}
              >
                <FactResultRow fact={fact} isSelected={isSelected} />
              </button>
            </li>
          );
        })
      )}
    </Stack>
  );
}
