import React, { useCallback } from "react";
import { useNavigate } from "react-router-dom"; 
import SidebarFilters from "./SidebarFilters";
import FactResultsTable from "./FactResultsTable";
import Button from "../../atoms/Button";
import * as styles from "./FactDatabase.module.scss";
import { useFactDatabase } from "../../hocks/useFactDatabase";

export default function FactDatabase() {
  const navigate = useNavigate();

  // Custom hook for facts, filters, subjects, audiences, and infinite scroll
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
    refetch,
    loadMore,
  } = useFactDatabase();

  // Handler: go to fact details
  const goLink = useCallback(
    (fact) => navigate(`/facts/${fact.id}`),
    [navigate]
  );

  // Handler: update keyword in filter (controlled input)
  const handleKeywordChange = useCallback(
    (e) => {
      const value = e.target.value;
      setFilters((f) => ({ ...f, keyword: value }));
    },
    [setFilters]
  );

  // Handler: perform search (by re-applying filters)
  const handleKeywordSearch = useCallback(() => {
    setFilters((f) => ({ ...f })); // triggers reload via useEffect
  }, [setFilters]);

  // Handler: Enter key triggers keyword search
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") handleKeywordSearch();
    },
    [handleKeywordSearch]
  );

  // Sidebar: tri-state subject/audience chip change triggers filter change
  const handleSidebarFiltersChange = useCallback(
    (nextFilters) => setFilters(nextFilters),
    [setFilters]
  );

  // Sidebar: "Apply Filters" button triggers reload (and closes dropdown in mobile, if any)
  const handleSidebarApplyFilters = useCallback(
    () => setFilters((f) => ({ ...f })),
    [setFilters]
  );

  // Keyword searchbar: clear field handler
  const handleClearKeyword = useCallback(() => {
    setFilters((f) => ({ ...f, keyword: "" }));
    // Optionally, trigger a search here: setFilters((f) => ({ ...f, keyword: "" }));
  }, [setFilters]);

  // Keyboard accessibility: add handler for clearing keyword on Esc key
  const handleSearchBarKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") {
        handleClearKeyword();
      } else if (e.key === "Enter") {
        handleKeywordSearch();
      }
    },
    [handleClearKeyword, handleKeywordSearch]
  );

  return (
    <div className={styles.factDatabase}>
      {/* ---- HEADER ---- */}
      <header className={styles.factDatabase__header}>
        <h1 className={styles.factDatabase__title}>★ TACC Fab‑Fact Database ★</h1>
      </header>

      {/* ---- SEARCH BAR ---- */}
      <section
        className={styles.factDatabase__searchbar}
        role="search"
        aria-label="Fact database search"
      >
        <input
          type="text"
          placeholder="Keyword search"
          value={filters.keyword || ""}
          onChange={handleKeywordChange}
          onKeyDown={handleSearchBarKeyDown}
          aria-label="Keyword search"
          className={styles.keywordInput}
        />
        {/* Optional clear button for UX */}
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
        <Button
          variant="outlined"
          size="md"
          onClick={handleKeywordSearch}
          aria-label="Run keyword search"
          disabled={loading}
        >
          Find
        </Button>
        <Button
          variant="outlined"
          size="md"
          onClick={() => navigate("/facts/new/")}
          aria-label="Add new fact"
        >
          ＋ Add Fact
        </Button>
      </section>

      {/* ---- MAIN LAYOUT: SIDEBAR + RESULTS ---- */}
      <main
        className={styles.factDatabase__content}
        role="main"
        aria-label="Main fact database content"
      >
        {/* ---- SIDEBAR FILTERS ---- */}
        <aside
          className={styles.factDatabase__sidebar}
          aria-label="Filter options"
        >
          <SidebarFilters
            filters={filters}
            setFilters={setFilters}
            subjects={subjects}
            audiences={audiences}
            subjectsInclude={filters.subjectsInclude || []}
            subjectsExclude={filters.subjectsExclude || []}
            audiencesInclude={filters.audiencesInclude || []}
            audiencesExclude={filters.audiencesExclude || []}
            onFiltersChange={handleSidebarFiltersChange}
            onApplyFilters={handleSidebarApplyFilters}
          />
        </aside>

        {/* ---- FACT RESULTS ---- */}
        <section
          className={styles.factDatabase__results}
          aria-label="Fact search results"
        >
          {/* Error message */}
          {error && (
            <div
              className={styles.factDatabase__error}
              role="alert"
              aria-live="assertive"
              tabIndex={0}
            >
              Error: {error}
            </div>
          )}

          {/* Loading spinner/message */}
          {loading && (
            <div
              className={styles.factDatabase__loadingMessage}
              role="status"
              aria-live="polite"
            >
              Loading…
            </div>
          )}

          {/* Facts Table + Infinite Scroll Loader + Empty/End States */}
          {!loading && (
            <>
              <FactResultsTable
                facts={facts}
                onRowClick={goLink}
                selectedFact={false}
              />

              {/* Infinite scroll loader */}
              {hasMore && (
                <div
                  ref={loaderRef}
                  className={styles.factDatabase__loader}
                  data-loading={loadingMore ? "true" : "false"}
                  aria-live="polite"
                  aria-label={
                    loadingMore
                      ? "Loading more facts"
                      : "Scroll for more facts"
                  }
                  role="status"
                >
                  {loadingMore ? "Loading more facts…" : "Scroll for more…"}
                </div>
              )}

              {/* End of results */}
              {!hasMore && facts.length > 0 && (
                <div
                  className={styles.factDatabase__end}
                  aria-label="End of results"
                  tabIndex={0}
                >
                  End of results.
                </div>
              )}

              {/* Empty results */}
              {!facts.length && !loading && !error && (
                <div
                  className={styles.factDatabase__end}
                  aria-label="No results found"
                  tabIndex={0}
                >
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
