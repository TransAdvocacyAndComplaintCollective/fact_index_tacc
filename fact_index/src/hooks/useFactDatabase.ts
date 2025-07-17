// hooks/useFactDatabase.ts
import { useState, useCallback, useRef, useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

export interface Fact {
  title?: string;
  id: number | string;
  fact_text: string;
  timestamp: string;
  source?: string;
  type?: string;
  context?: string;
  year?: number;
  user?: string;
  suppressed?: boolean;
  summary?: string;
  subjects: string[];
  audiences: string[];
}

export interface Subject {
  id: number;
  name: string;
}
export interface Audience {
  id: number;
  name: string;
}

export interface UseFactDatabaseFilters {
  keyword?: string;
  subjectsInclude?: string[];
  subjectsExclude?: string[];
  audiencesInclude?: string[];
  audiencesExclude?: string[];
  yearFrom?: number;
  yearTo?: number;
  sortBy?: 'date' | 'year' | 'name' | 'relevance';
  sortOrder?: 'asc' | 'desc';
}

const FACTS_PER_PAGE = 50;

export function useFactDatabase() {
  // --- Filters state ---
  const [filters, setFilters] = useState<UseFactDatabaseFilters>({});
  console.log('[useFactDatabase] Current filters:', filters);

  // --- Fetch subjects & audiences ---
  const {
    data: subjects = [],
    isLoading: loadingSubjects,
    error: errorSubjects,
  } = useQuery<Subject[]>({
    queryKey: ['subjects'],
    queryFn: async () => {
      console.log('[useFactDatabase] Fetching subjects');
      const res = await fetch('/api/facts/subjects');
      if (!res.ok) throw new Error('Failed to fetch subjects');
      const result = await res.json();
      console.log('[useFactDatabase] Subjects:', result);
      return result;
    },
    staleTime: 10 * 60 * 1000,
  });

  const {
    data: audiences = [],
    isLoading: loadingAudiences,
    error: errorAudiences,
  } = useQuery<Audience[]>({
    queryKey: ['audiences'],
    queryFn: async () => {
      console.log('[useFactDatabase] Fetching audiences');
      const res = await fetch('/api/facts/audiences');
      if (!res.ok) throw new Error('Failed to fetch audiences');
      const result = await res.json();
      console.log('[useFactDatabase] Audiences:', result);
      return result;
    },
    staleTime: 10 * 60 * 1000,
  });

  // --- Facts: Infinite scroll ---
  const fetchFacts = async ({ pageParam = 0 }) => {
    // Compose the request body using all filter params and pagination
    const body = {
      ...filters,
      offset: pageParam,
      limit: FACTS_PER_PAGE,
    };

    // Remove any empty/null arrays for compatibility
    const filterArrayKeys = ['subjectsInclude', 'subjectsExclude', 'audiencesInclude', 'audiencesExclude'] as const;
    type FilterKey = typeof filterArrayKeys[number];
    filterArrayKeys.forEach((key: FilterKey) => {
      const value = body[key];
      if (Array.isArray(value) && value.length === 0) {
        delete body[key];
      }
    });

    console.log('[useFactDatabase] Fetching facts. Body:', body);
    const res = await fetch('/api/facts/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error('[useFactDatabase] Error fetching facts:', res.status, res.statusText);
      throw new Error('Failed to fetch facts');
    }
    const result = await res.json();
    console.log('[useFactDatabase] Fetched facts page (offset', pageParam, '):', result);
    return result as Fact[];
  };

  // --- Infinite Query for facts ---
  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    error: errorFacts,
  } = useInfiniteQuery({
    queryKey: ['facts', filters],
    queryFn: fetchFacts,
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const nextPage =
        lastPage.length === FACTS_PER_PAGE
          ? allPages.length * FACTS_PER_PAGE
          : undefined;
      console.log('[useFactDatabase] getNextPageParam:', {
        lastPageLength: lastPage.length,
        allPagesLength: allPages.length,
        nextPage,
      });
      return nextPage;
    },
  });

  // Combine all fact pages into a flat array
  const facts: Fact[] = useMemo(() => {
    const pages = data?.pages ?? [];
    const flatFacts = pages.flat();
    console.log('[useFactDatabase] Combined facts:', flatFacts);
    return flatFacts;
  }, [data]);

  // --- Infinite Scroll LoaderRef ---
  const observer = useRef<IntersectionObserver | null>(null);
  const loaderRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (isLoading || isFetchingNextPage) return;
      observer.current?.disconnect();
      if (node && hasNextPage) {
        observer.current = new IntersectionObserver((entries) => {
          if (entries[0].isIntersecting) {
            console.log('[useFactDatabase] LoaderRef triggered. Fetching next page.');
            fetchNextPage();
          }
        });
        observer.current.observe(node);
      }
    },
    [isLoading, isFetchingNextPage, hasNextPage, fetchNextPage]
  );

  // --- Loading state logic ---
  const loading = isLoading || loadingSubjects || loadingAudiences;
  const loadingMore = isFetchingNextPage;
  const hasMore = !!hasNextPage;

  // --- Main error state ---
  const error = errorFacts || errorSubjects || errorAudiences;
  if (error) console.error('[useFactDatabase] Error:', error);

  // --- Expose everything ---
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
    loadMore: () => {
      if (hasNextPage) {
        console.log('[useFactDatabase] loadMore called.');
        fetchNextPage();
      }
    },
  };
}
