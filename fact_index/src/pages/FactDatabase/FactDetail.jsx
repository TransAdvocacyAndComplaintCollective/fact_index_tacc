import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import * as styles from "./FactDetail.module.scss";

export default function FactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [fact, setFact] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/facts/facts/${id}`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(setFact)
      .catch(() => setFact(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <main className={styles.factDetailMain}>
        <p role="status" aria-live="polite">Loading…</p>
      </main>
    );
  }
  if (!fact) {
    return (
      <main className={styles.factDetailMain}>
        <p role="status" aria-live="polite">Not found.</p>
      </main>
    );
  }

  return (
    <main className={styles.factDetailMain} aria-labelledby="fact-detail-title">
      <nav className={styles.factDetailNav} aria-label="Page navigation">
        <Link to="/facts" className={styles.factDetailBackLink}>
          ← Back to Fact List
        </Link>
        <button
          type="button"
          className={styles.factDetailEditBtn}
          onClick={() => navigate(`/facts/${id}/edit`)}
          aria-label="Edit this fact"
        >
          Edit
        </button>
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
