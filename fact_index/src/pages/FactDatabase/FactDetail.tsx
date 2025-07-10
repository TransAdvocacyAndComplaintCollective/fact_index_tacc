import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Button from "../../atoms/Button"; // Update path if needed
import * as styles from "./FactDetail.module.scss";

interface Fact {
  id: string | number;
  fact_text: string;
  source?: string;
  user?: string;
  timestamp?: string;
  subjects?: string[];
  audiences?: string[];
  type?: string;
  context?: string;
}

export default function FactDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [fact, setFact] = useState<Fact | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/facts/facts/${id}`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(setFact)
      .catch(() => setFact(null))
      .finally(() => setLoading(false));
  }, [id]);

  // --- Loading State
  if (loading) {
    return (
      <main className={styles.factDetailMain}>
        <p role="status" aria-live="polite">Loading…</p>
      </main>
    );
  }
  // --- Not Found
  if (!fact) {
    return (
      <main className={styles.factDetailMain}>
        <nav className={styles.factDetailNav} aria-label="Page navigation">
          <Button
            to="/facts"
            variant="outlined"
            size="md"
          >
            ← Back to Fact List
          </Button>
        </nav>
        <p role="status" aria-live="polite">Not found.</p>
      </main>
    );
  }

  // --- Fact Detail View ---
  return (
    <main className={styles.factDetailMain} aria-labelledby="fact-detail-title">
      <nav className={styles.factDetailNav} aria-label="Page navigation">
        <Button
          to="/facts"
          variant="outlined"
          size="md"
        >
          ← Back to Fact List
        </Button>
        <Button
          variant="primary"
          size="md"
          onClick={() => navigate(`/facts/${id}/edit`)}
          aria-label="Edit this fact"
        >
          Edit
        </Button>
      </nav>
      <h1 id="fact-detail-title" className={styles.factDetailTitle}>{fact.fact_text}</h1>
      <dl className={styles.factDetailList}>
        <dt>Source</dt>
        <dd>
          {fact.source ? (
            <a
              href={fact.source}
              target="_blank"
              rel="noopener noreferrer"
              title={`Source: ${fact.source}`}
              className={styles.factDetailSourceLink}
            >
              {fact.source}
            </a>
          ) : (
            "N/A"
          )}
        </dd>
        <dt>Added by</dt>
        <dd>{fact.user || "Unknown"}</dd>
        <dt>Date</dt>
        <dd>{(fact.timestamp || "").slice(0, 10)}</dd>
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
        <dd>{fact.type || "None"}</dd>
        {fact.context && (
          <>
            <dt>Context</dt>
            <dd>
              <span className={styles.factDetailContext}>{fact.context}</span>
            </dd>
          </>
        )}
      </dl>
    </main>
  );
}
