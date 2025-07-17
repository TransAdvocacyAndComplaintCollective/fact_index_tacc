import React, { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import SidebarFilters from "./SidebarFilters";
import FactResultsTable from "./FactResultsTable";
import Button from "../../atoms/Button";
import * as styles from "./FactDatabase.module.scss";
import { useFactDatabase, UseFactDatabaseFilters } from "../../hooks/useFactDatabase";


export default function FactDatabase() {
  const navigate = useNavigate();

  const {
    facts,
    subjects,
    audiences,
    filters,
    setFilters,
    loading,
    loadingMore,
    hasMore,
    error,
    loaderRef,
    loadMore,
  } = useFactDatabase();

  const goLink = useCallback(
    (fact: { id: string | number }) => navigate(`/facts/${fact.id}`),
    [navigate]
  );

  const handleKeywordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setFilters((f) => ({ ...f, keyword: value }));
    },
    [setFilters]
  );

  const handleKeywordSearch = useCallback(() => {
    setFilters((f) => ({ ...f }));
  }, [setFilters]);

  const handleSidebarFiltersChange = useCallback(
    (newFilters: UseFactDatabaseFilters) => setFilters(newFilters),
    [setFilters]
  );
  const handleSidebarApplyFilters = useCallback(
    () => setFilters((f) => ({ ...f })),
    [setFilters]
  );

  const handleClearKeyword = useCallback(() => {
    setFilters((f) => ({ ...f, keyword: "" }));
  }, [setFilters]);

  const handleSearchBarKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        handleClearKeyword();
      } else if (e.key === "Enter") {
        handleKeywordSearch();
      }
    },
    [handleClearKeyword, handleKeywordSearch]
  );

  const handleLoadMore = useCallback(() => {
    if (hasMore && !loading && !loadingMore) {
      loadMore();
    }
  }, [hasMore, loading, loadingMore, loadMore]);

  return (
    <div className={styles.factDatabase}>
      <div className={styles.factDatabaseHeader} role="banner" aria-label="Site Banner">
        <h1 className={styles.factDatabaseTitle}>★ TACC Fab‑Fact Database ★</h1>
      </div>

      <section className={styles.factDatabaseSearchbar} role="search" aria-label="Fact database search">
        <input
          type="text"
          placeholder="Keyword search"
          value={filters.keyword || ""}
          onChange={handleKeywordChange}
          onKeyDown={handleSearchBarKeyDown}
          aria-label="Keyword search"
          className={styles.keywordInput}
        />
        {filters.keyword && (
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={handleClearKeyword}
            aria-label="Clear keyword"
            className={styles.clearKeywordButton}
          >
            ×
          </Button>
        )}
        <Button variant="outlined" size="md" onClick={handleKeywordSearch} aria-label="Run keyword search" disabled={loading}>
          Find
        </Button>
        <Button variant="outlined" size="md" onClick={() => navigate("/facts/new/")} aria-label="Add new fact">
          ＋ Add Fact
        </Button>
      </section>

      <main className={styles.factDatabaseContent} role="main" aria-label="Main fact database content">
        <aside className={styles.factDatabaseSidebar} aria-label="Filter options">
          <SidebarFilters
            filters={filters}
            setFilters={setFilters}
            subjects={subjects}
            audiences={audiences}
            onFiltersChange={handleSidebarFiltersChange}
            onApplyFilters={handleSidebarApplyFilters}
          />
        </aside>

        <section className={styles.factDatabaseResults} aria-label="Fact search results">
          {error && (
            <div className={styles.factDatabaseError} role="alert" aria-live="assertive">
              Error: {error.toString()}
            </div>
          )}

          {loading && (
            <div className={styles.factDatabaseLoadingMessage} role="status" aria-live="polite">
              Loading…
            </div>
          )}

          {!loading && (
            <>
              <FactResultsTable facts={facts} onRowClick={goLink} />

              {hasMore && (
                <button
                  ref={(node) => loaderRef(node as HTMLDivElement | null)}
                  className={styles.loader}
                  data-loading={loadingMore ? "true" : "false"}
                  aria-live="polite"
                  aria-label={loadingMore ? "Loading more facts" : "Scroll for more facts"}
                  type="button"
                  onClick={handleLoadMore}
                  style={{ cursor: "pointer" }}
                >
                  {loadingMore ? "Loading more facts…" : "Scroll for more…"}
                </button>
              )}

              {!hasMore && facts.length > 0 && (
                <div className={styles.factDatabaseEnd}>End of results.</div>
              )}

              {!facts.length && !loading && !error && (
                <div className={styles.factDatabaseEnd} aria-label="No results found">
                  No facts found. Try changing your filters or search.
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
