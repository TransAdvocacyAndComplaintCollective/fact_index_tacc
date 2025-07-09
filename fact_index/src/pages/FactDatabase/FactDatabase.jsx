import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import SidebarFilters from "./SidebarFilters";
import FactResultsTable from "./FactResultsTable";
import * as styles from "./FactDatabase.module.scss";

const PAGE_SIZE = 10;

function extractIncludeExclude(chipObj) {
  const include = [];
  const exclude = [];
  for (const [name, state] of Object.entries(chipObj || {})) {
    if (state === "include") include.push(name);
    if (state === "exclude") exclude.push(name);
  }
  return { include, exclude };
}

export default function FactDatabase() {
  const [facts, setFacts] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [audiences, setAudiences] = useState([]);
  const [filters, setFilters] = useState({
    subjects: {},
    audiences: {},
    dateFrom: "",
    dateTo: "",
    yearFrom: "",
    yearTo: "",
    keyword: ""
  });
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loaderRef = useRef();
  const navigate = useNavigate();

  const goLink = fact => navigate(`/facts/${fact.id}`);

  useEffect(() => {
    axios.get("/api/facts/subjects")
      .then(res => setSubjects(res.data))
      .catch(() => {});
    axios.get("/api/facts/audiences")
      .then(res => setAudiences(res.data))
      .catch(() => {});
  }, []);

  const filtersToApiParams = filters => {
    const { include: subjectsInclude, exclude: subjectsExclude } = extractIncludeExclude(filters.subjects);
    const { include: audiencesInclude, exclude: audiencesExclude } = extractIncludeExclude(filters.audiences);
    const baseParams = {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      yearFrom: filters.yearFrom,
      yearTo: filters.yearTo,
      keyword: filters.keyword
    };
    if (subjectsInclude.length) baseParams.subjectsInclude = subjectsInclude;
    if (subjectsExclude.length) baseParams.subjectsExclude = subjectsExclude;
    if (audiencesInclude.length) baseParams.audiencesInclude = audiencesInclude;
    if (audiencesExclude.length) baseParams.audiencesExclude = audiencesExclude;
    return baseParams;
  };

  useEffect(() => {
    setLoading(true);
    setFacts([]);
    setHasMore(true);
    axios.get("/api/facts/facts", {
      params: { ...filtersToApiParams(filters), limit: PAGE_SIZE, offset: 0 }
    })
      .then(res => {
        setFacts(res.data);
        setHasMore(res.data.length === PAGE_SIZE);
      })
      .catch(() => setFacts([]))
      .finally(() => setLoading(false));
  }, [filters]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    axios.get("/api/facts/facts", {
      params: { ...filtersToApiParams(filters), limit: PAGE_SIZE, offset: facts.length }
    })
      .then(res => {
        setFacts(prev => [...prev, ...res.data]);
        setHasMore(res.data.length === PAGE_SIZE);
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false));
  }, [filters, facts.length, loadingMore, hasMore, loading]);

  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;
    const observer = new window.IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadMore();
    }, { threshold: 0.1 });
    const el = loaderRef.current;
    if (el) observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
      observer.disconnect();
    };
  }, [loadMore, hasMore, loading, loadingMore, facts.length]);

  return (
    <div className={styles.factDatabase}>
      <header className={styles.factDatabase__header}>
        <h1 className={styles.factDatabase__title}>★ TACC Fab‑Fact Database ★</h1>
        <button
          className={styles.factDatabase__addBtn}
          onClick={() => navigate("/facts/new/")}
          aria-label="Add new fact"
        >
          ＋ Add Fact
        </button>
      </header>

      <section
        className={styles.factDatabase__searchbar}
        role="search"
        aria-label="Fact database search"
      >
        <input
          type="text"
          placeholder="Keyword search"
          value={filters.keyword}
          onChange={e => setFilters(f => ({ ...f, keyword: e.target.value }))}
          onKeyDown={e => {
            if (e.key === "Enter") setFilters(f => ({ ...f, keyword: e.target.value }));
          }}
          aria-label="Keyword search"
        />
        <button
          onClick={() => setFilters(f => ({ ...f }))}
          aria-label="Run keyword search"
        >
          Find
        </button>
      </section>

      <main
        className={styles.factDatabase__content}
        role="main"
        aria-label="Main fact database content"
      >
        <aside
          className={styles.factDatabase__sidebar}
          role="complementary"
          aria-label="Filter options"
        >
          <SidebarFilters
            filters={filters}
            setFilters={setFilters}
            subjects={subjects}
            audiences={audiences}
          />
        </aside>
        <section
          className={styles.factDatabase__results}
          aria-label="Fact search results"
        >
          {loading && (
            <div className={styles.factDatabase__loadingMessage} role="status" aria-live="polite">
              Loading…
            </div>
          )}
          {!loading && (
            <>
              <FactResultsTable facts={facts} onRowClick={goLink} selectedFact={false} />
              {hasMore && (
                <div
                  ref={loaderRef}
                  className={styles.factDatabase__loader}
                  data-loading={loadingMore ? "true" : "false"}
                  aria-live="polite"
                  aria-label={loadingMore ? "Loading more facts" : "Scroll for more facts"}
                  role="status"
                >
                  {loadingMore ? "Loading more facts…" : "Scroll for more…"}
                </div>
              )}
              {!hasMore && facts.length > 0 && (
                <div className={styles.factDatabase__end} aria-label="End of results" tabIndex={0}>
                  End of results.
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
