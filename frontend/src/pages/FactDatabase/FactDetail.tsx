// pages/FactDatabase/FactDetail.tsx
import React from "react";
import { useParams } from "react-router-dom";
import styles from "./style/FactDetail.module.scss";
import ButtonNavLink from "@/atoms/Button/ButtonNavLink";
import FactDetailList from "@/molecules/FactDatabase/FactDetailList";
import useFact from "@/hooks/useFact";

export default function FactDetail() {
  const { id } = useParams<{ id: string }>();
  const { fact, loading, error } = useFact(id);

  if (loading) {
    return (
      <main className={styles.factDetailMain}>
        <p role="status" aria-live="polite">Loading…</p>
      </main>
    );
  }

  if ((error?.length ?? 0) > 0 || !fact) {
    return (
      <main className={styles.factDetailMain}>
        <nav className={styles.factDetailNav} aria-label="Page navigation">
          <ButtonNavLink to="/facts" variant="outlined" size="md">
            ← Back to Fact List
          </ButtonNavLink>
        </nav>
        <p role="status" aria-live="polite">
          {(error?.length ?? 0) > 0 ? error : "Not found."}
        </p>
      </main>
    );
  }

  return (
    <main className={styles.factDetailMain} aria-labelledby="fact-detail-title">
      <nav className={styles.factDetailNav} aria-label="Page navigation">
        <ButtonNavLink to="/facts" variant="outlined" size="md">
          ← Back to Fact List
        </ButtonNavLink>
        <ButtonNavLink
          variant="primary"
          size="md"
          to={`/facts/${id}/edit`}
          aria-label="Edit this fact"
        >
          Edit
        </ButtonNavLink>
      </nav>
      <h1 id="fact-detail-title" className={styles.factDetailTitle}>
              {fact.fact_text ?? ""}
            </h1>
      <FactDetailList fact={fact} />
    </main>
  );
}
