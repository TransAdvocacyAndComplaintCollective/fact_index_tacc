import React, { useState, useMemo, useCallback } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";

// Types (expand as needed)
type Subject = { id: number; name: string };
type Audience = { id: number; name: string };
type Fact = Record<string, any>;
type Filters = {
  keyword?: string;
  yearFrom?: number;
  yearTo?: number;
  year?: number;
  includeSuppressed?: boolean;
  subjectsInclude?: string[];
  subjectsExclude?: string[];
  audiencesInclude?: string[];
  audiencesExclude?: string[];
  sortBy?: string;
  sortOrder?: string;
  [key: string]: any;
};

async function fetchSubjects(): Promise<Subject[]> {
  const res = await fetch("/api/facts/subjects");
  if (!res.ok) throw new Error((await res.json()).error || res.statusText);
  return res.json();
}
async function fetchAudiences(): Promise<Audience[]> {
  const res = await fetch("/api/facts/audiences");
  if (!res.ok) throw new Error((await res.json()).error || res.statusText);
  return res.json();
}

export function useFactDatabase(initialFilters: Filters = {}, pageSize = 50) {
  const [filters, setFilters] = useState<Filters>(initialFilters);

  // Correct React Query usage
  const querySubjects = useQuery({
    queryKey: ["subjects"],
    queryFn: fetchSubjects,
    staleTime: 10 * 60 * 1000,
  });
  const subjects = querySubjects.data ?? [];
  const loadingSubjects = querySubjects.isLoading;
  const errorSubjects = querySubjects.error as Error | undefined;
  const refetchSubjects = querySubjects.refetch;

  const queryAudiences = useQuery({
    queryKey: ["audiences"],
    queryFn: fetchAudiences,
    staleTime: 10 * 60 * 1000,
  });
  const audiences = queryAudiences.data ?? [];
  const loadingAudiences = queryAudiences.isLoading;
  const errorAudiences = queryAudiences.error as Error | undefined;
  const refetchAudiences = queryAudiences.refetch;

  // Infinite facts query
  const fetchFacts = async ({ pageParam = 0 }): Promise<{ data: Fact[]; nextOffset?: number }> => {
    const {
      keyword = "",
      yearFrom,
      yearTo,
      year,
      includeSuppressed = false,
      subjectsInclude = [],
      subjectsExclude = [],
      audiencesInclude = [],
      audiencesExclude = [],
      sortBy = "date",
      sortOrder = "desc",
    } = filters;

    const from = year ?? yearFrom;
    const to = year ?? yearTo;

    const payload = {
      keyword,
      yearFrom: from,
      yearTo: to,
      offset: pageParam,
      limit: pageSize,
      includeSuppressed,
      subjectsInclude,
      subjectsExclude,
      audiencesInclude,
      audiencesExclude,
      sortBy,
      sortOrder,
    };

    const res = await fetch("/api/facts/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    const data = await res.json();
    return { data, nextOffset: data.length === pageSize ? pageParam + data.length : undefined };
  };

  const {
    data,
    error: errorFacts,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    refetch: refetchFacts,
  } = useInfiniteQuery<{ data: Fact[]; nextOffset?: number }, Error>({
    queryKey: ["facts", filters],
    queryFn: fetchFacts,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    keepPreviousData: true,
  });

  // Flatten paged results
  const facts: Fact[] = useMemo(
    () => (data ? data.pages.flatMap((p) => p.data) : []),
    [data]
  );

  // Infinite scroll with intersection observer
  const { ref: loaderRef, inView } = useInView({ rootMargin: "200px" });
  React.useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Manual reload with filters
  const refetch = useCallback(() => {
    refetchFacts();
    refetchSubjects();
    refetchAudiences();
  }, [refetchFacts, refetchSubjects, refetchAudiences]);

  const loading = isFetching && !isFetchingNextPage;
  const loadingMore = isFetchingNextPage;
  const hasMore = hasNextPage;
  const error =
    (errorFacts as Error)?.message ||
    errorSubjects?.message ||
    errorAudiences?.message ||
    null;

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
    loadMore: fetchNextPage,
    loadingSubjects,
    loadingAudiences,
  };
}

export default useFactDatabase;
