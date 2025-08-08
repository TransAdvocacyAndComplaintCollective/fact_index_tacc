// src/molecules/FactDetailList.tsx
import React from "react";
import styles from "./style/FactDetailList.module.scss"; // Optional, for styling
import type { Fact } from "../../hooks/useFactDatabase"; // Assuming you have a types file

interface FactDetailListProps {
    fact: Fact;
}

const FactDetailList: React.FC<FactDetailListProps> = ({ fact }) => (
    <dl className={styles.factDetailList}>
        <dt>Source</dt>
        <dd>
            {(fact.source ?? "").trim().length > 0 ? (
                <a
                    href={fact.source}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.factDetailSourceLink}
                >
                    {fact.source}
                </a>
            ) : (
                "N/A"
            )}
        </dd>

        <dt>Added by</dt>
        <dd>
            {(fact.user?.trim().length ?? 0) > 0 ? fact.user : "Unknown"}
        </dd>

        <dt>Date</dt>
        <dd>
            {fact.timestamp && fact.timestamp.trim().length > 0
                ? fact.timestamp.slice(0, 10)
                : "N/A"}
        </dd>

        <dt>Subjects</dt>
        <dd>
            {Array.isArray(fact.subjects) && fact.subjects.length
                ? fact.subjects.join(", ")
                : "None"}
        </dd>

        <dt>Target Audiences</dt>
        <dd>
            {Array.isArray(fact.audiences) && fact.audiences.length
                ? fact.audiences.join(", ")
                : "None"}
        </dd>

        <dt>Type</dt>
        <dd>
            {(fact.type ?? "").trim().length > 0 ? (fact.type ?? "").trim() : "None"}
        </dd>

        {(fact.context?.trim() ?? "").length > 0 && (
            <>
                <dt>Context</dt>
                <dd>
                    <span>{fact.context || ""}</span>
                </dd>
            </>
        )}
    </dl>
);

export default FactDetailList;
