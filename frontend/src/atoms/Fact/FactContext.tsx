import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import * as styles from "./FactDetail.module.scss";
import FactDetailNav from "@/molecules/FactDetailNav";
import FactDetailList from "@/molecules/FactDatabase/FactDetailList";
import type { Fact } from "@/hooks/useFactDatabase";

export default function FactDetail() {
  const { id } = useParams<{ id: string }>();
  const [fact, setFact] = useState<Fact | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/facts/facts/${id}`)
      .then(res =>
        res.ok
          ? res.json()
          : Promise.reject(new Error('Network response was not ok'))
      )
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
        <FactDetailNav />
        <p role="status" aria-live="polite">Not found.</p>
      </main>
    );
  }

  return (
    <main className={styles.factDetailMain} aria-labelledby="fact-detail-title">
      <FactDetailNav factId={id} showEdit />
      <h1 id="fact-detail-title" className={styles.factDetailTitle}>{fact.fact_text}</h1>
      <FactDetailList fact={fact} />
    </main>
  );
}
