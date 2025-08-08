import { useState, useCallback, useRef, useMemo } from "react";
import type { QueryFunctionContext } from "@tanstack/react-query";
import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
} from "@tanstack/react-query";
import axios from "axios";

// ==== TYPES ====

export interface Fact {
  id: number | string;
  fact_text: string;
  statement?: string;
  title?: string;
  timestamp?: string;
  source?: string;
  type?: string;
  context?: string;
  year?: number;
  user?: string;
  suppressed?: boolean;
  summary?: string;
  subjects?: string[];
  audiences?: string[];
}

export interface Subject {
  id: number | string;
  name: string;
}
export interface Audience {
  id: number | string;
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
  sortBy?: "date" | "year" | "name" | "relevance";
  sortOrder?: "asc" | "desc";
}

const FACTS_PER_PAGE = 50;

// ==== HOOK ====

export function useFactDatabase() {
  const [filters, setFilters] = useState<UseFactDatabaseFilters>({});

  // --- SUBJECTS ---
  const {
    data: subjectsRaw,
    isLoading: loadingSubjects,
    error: errorSubjects,
  } = useQuery<Subject[], Error>({
    queryKey: ["subjects"],
    queryFn: async () => {
      // Always expect array
      const res = await axios.get<Subject[]>("/api/facts/subjects");
      return Array.isArray(res.data) ? res.data : [];
    },
    staleTime: 10 * 60 * 1000,
  });

  // --- AUDIENCES ---
  const {
    data: audiencesRaw,
    isLoading: loadingAudiences,
    error: errorAudiences,
  } = useQuery<Audience[], Error>({
    queryKey: ["audiences"],
    queryFn: async () => {
      const res = await axios.get<Audience[]>("/api/facts/audiences");
      return Array.isArray(res.data) ? res.data : [];
    },
    staleTime: 10 * 60 * 1000,
  });

  // Always guarantee arrays, never null/undefined
  const subjects = useMemo(() => Array.isArray(subjectsRaw) ? subjectsRaw : [], [subjectsRaw]);
  const audiences = useMemo(() => Array.isArray(audiencesRaw) ? audiencesRaw : [], [audiencesRaw]);

  // --- FACTS (Infinite Scroll) ---
  const fetchFacts = useCallback(
    async ({
      pageParam = 0,
    }: QueryFunctionContext<["facts", UseFactDatabaseFilters]>) => {
      const offset = typeof pageParam === "number" ? pageParam : Number(pageParam) || 0;
      // Compose request body, removing empty arrays (API expects missing, not [])
      const body: Record<string, unknown> = {
        ...filters,
        offset,
        limit: FACTS_PER_PAGE,
      };
      [
        "subjectsInclude",
        "subjectsExclude",
        "audiencesInclude",
        "audiencesExclude",
      ].forEach((k) => {
        if (Array.isArray(body[k]) && body[k].length === 0) delete body[k];
      });

      try {
        // POST to /api/fact/facts/search
        const res = await axios.post<Fact[]>("/api/facts/search", body);

        // Always guarantee array
        return Array.isArray(res.data) ? res.data : [];
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[Facts] Error fetching facts:", err);
        throw err;
      }
    },
    [filters]
  );

  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    error: errorFacts,
  } = useInfiniteQuery<
    Fact[],
    Error,
    InfiniteData<Fact[]>,
    ["facts", UseFactDatabaseFilters]
  >({
    queryKey: ["facts", filters],
    queryFn: fetchFacts,
    initialPageParam: 0,
    getNextPageParam: (lastPage: Fact[], pages: Fact[][]) =>
      lastPage.length === FACTS_PER_PAGE
        ? pages.length * FACTS_PER_PAGE
        : undefined,
  });

  // --- Flatten facts across pages ---
  const facts = useMemo(() => (data?.pages.flat() ?? []), [data]);

  // --- Infinite scroll loader ref ---
  const observer = useRef<IntersectionObserver | null>(null);
  const loaderRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (isLoading || isFetchingNextPage) return;
      if (observer.current) observer.current.disconnect();
      if (node && hasNextPage) {
        observer.current = new window.IntersectionObserver((entries) => {
          if (entries[0].isIntersecting) {
            fetchNextPage().catch((error) => {
              // eslint-disable-next-line no-console
              console.error("Error fetching next page:", error);
            });
          }
        });
        observer.current.observe(node);
      }
    },
    [isLoading, isFetchingNextPage, hasNextPage, fetchNextPage]
  );

  // --- Log filter changes for debug ---
  const setFiltersWithLog = useCallback(
    (
      next:
        | UseFactDatabaseFilters
        | ((prev: UseFactDatabaseFilters) => UseFactDatabaseFilters)
    ) => {
      setFilters((prev) => {
        const nextFilters = typeof next === "function" ? next(prev) : next;
        // eslint-disable-next-line no-console
        console.log("[Filters] Changing filters:", nextFilters);
        return nextFilters;
      });
    },
    []
  );

  return {
    facts,
    subjects,
    audiences,
    filters,
    setFilters: setFiltersWithLog,
    loading: isLoading || loadingSubjects || loadingAudiences,
    loadingMore: isFetchingNextPage,
    hasMore: !!hasNextPage,
    error: errorFacts || errorSubjects || errorAudiences || null,
    loaderRef,
    loadMore: fetchNextPage,
  };
}
