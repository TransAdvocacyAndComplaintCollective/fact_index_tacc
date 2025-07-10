import { useCallback, useEffect, useRef, useState } from 'react';

export function useFactDatabase(initialFilters = {}, pageSize = 50) {
  const [facts, setFacts] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [audiences, setAudiences] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(null);

  const offsetRef = useRef(0);
  const abortRef = useRef(null);
  const loaderRef = useRef(null);

  // Build request payload
  const buildPayload = useCallback((isReset) => {
    const {
      keyword = '',
      yearFrom,
      yearTo,
      year,
      includeSuppressed = false,
      subjectsInclude = [],
      subjectsExclude = [],
      audiencesInclude = [],
      audiencesExclude = [],
    } = filters;
    console.log('Building payload with filters:', filters);

    const from = year ?? yearFrom;
    const to = year ?? yearTo;

    return {
      keyword,
      yearFrom: from,
      yearTo: to,
      offset: isReset ? 0 : offsetRef.current,
      limit: pageSize,
      includeSuppressed,
      subjectsInclude,
      subjectsExclude,
      audiencesInclude,
      audiencesExclude,
    };
  }, [filters, pageSize]);
  const fetchAudiences = useCallback(async () => { 
    try {
      const res = await fetch('/api/facts/audiences');
      if (!res.ok) {
        let detail = "";
        try {
          detail = (await res.json()).error || res.statusText;
        } catch { }
        setError(detail);
        return;
      }
      const data = await res.json();
      setAudiences(data);
    } catch (err) {
      console.error(err);
      setError(err.message || String(err));
    }
  }, []);
  const fetchSubjects = useCallback(async () => {
    try {
      const res = await fetch('/api/facts/subjects');
      if (!res.ok) {
        let detail = "";
        try {
          detail = (await res.json()).error || res.statusText;
        } catch { }
        setError(detail);
        return;
      }
      const data = await res.json();
      setSubjects(data);
    } catch (err) {
      setError(err.message || String(err));
    }
  }, []);

  // Fetch facts with abort handling
  const fetchFacts = useCallback(
    async (isReset = false) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (isReset) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      try {
        const payload = buildPayload(isReset);
        const res = await fetch('/api/facts/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!res.ok) {
          let detail = "";
          try {
            detail = (await res.json()).error || res.statusText;
          } catch { }
          // Handle non-200 responses
          setError(detail);
          return;
        }
        const data = await res.json();
        if (isReset) {
          setFacts(data);
          offsetRef.current = data.length;
        } else {
          setFacts((prev) => [...prev, ...data]);
          offsetRef.current += data.length;
        }
        setHasMore(data.length === pageSize);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error(err);
          setError(err.message || String(err));
        }
      } finally {
        if (isReset) setLoading(false);
        else setLoadingMore(false);
      }
    },
    [buildPayload, pageSize]
  );

  // Refetch when filters change
  useEffect(() => {
    offsetRef.current = 0;
    fetchFacts(true);
    fetchAudiences();
    fetchSubjects();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // IntersectionObserver for infinite scroll (stable callback)
  useEffect(() => {
    if (!loaderRef.current) return;

    let canceled = false;
    const node = loaderRef.current;

    const onIntersect = (entries) => {
      if (
        !canceled &&
        entries[0] &&
        entries[0].isIntersecting &&
        !loading &&
        !loadingMore &&
        hasMore
      ) {
        fetchFacts(false);
      }
    };

    const obs = new window.IntersectionObserver(onIntersect, {
      rootMargin: '200px'
    });
    obs.observe(node);

    return () => {
      canceled = true;
      obs.disconnect();
    };
  }, [loaderRef, loading, loadingMore, hasMore, fetchFacts]);

  // Manual reload/next-page
  const refetch = useCallback(() => fetchFacts(true), [fetchFacts]);
  const loadMore = useCallback(() => {
    if (!loading && !loadingMore && hasMore) fetchFacts(false);
  }, [loading, loadingMore, hasMore, fetchFacts]);

  return {
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
  };
}
export default useFactDatabase;
