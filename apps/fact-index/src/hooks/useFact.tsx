import { useCallback, useMemo, useState, useEffect } from "react";
import axios from "axios";
import { nprogress } from "@mantine/nprogress";
import { InfiniteData, useInfiniteQuery } from "@tanstack/react-query";

import type {
  ChipMap,
  FactApiParams,
  FactFilters,
  FactPage,
  FactRecord,
} from "../pages/FactDatabase/types";
import { useAuthContext } from "../context/AuthContext";

const DEFAULT_PAGE_SIZE = 10;

const extractIncludeExclude = (chipObj?: ChipMap) => {
  const include: string[] = [];
  const exclude: string[] = [];
  for (const [name, state] of Object.entries(chipObj || {})) {
    if (state === "include") include.push(name);
    if (state === "exclude") exclude.push(name);
  }
  return { include, exclude };
};

const createDefaultFilters = (): FactFilters => ({
  subjects: {},
  audiences: {},
  dateFrom: "",
  dateTo: "",
  yearFrom: "",
  yearTo: "",
  keyword: "",
});

const toApiParams = (currentFilters: FactFilters): FactApiParams => {
  const {
    include: subjectsInclude,
    exclude: subjectsExclude,
  } = extractIncludeExclude(currentFilters.subjects);
  const {
    include: audiencesInclude,
    exclude: audiencesExclude,
  } = extractIncludeExclude(currentFilters.audiences);

  const baseParams: FactApiParams = {
    dateFrom: currentFilters.dateFrom,
    dateTo: currentFilters.dateTo,
    yearFrom: currentFilters.yearFrom,
    yearTo: currentFilters.yearTo,
    keyword: currentFilters.keyword,
  };

  if (subjectsInclude.length) baseParams.subjectsInclude = subjectsInclude;
  if (subjectsExclude.length) baseParams.subjectsExclude = subjectsExclude;
  if (audiencesInclude.length) baseParams.audiencesInclude = audiencesInclude;
  if (audiencesExclude.length) baseParams.audiencesExclude = audiencesExclude;

  return baseParams;
};

export interface UseFactOptions {
  initialFilters?: FactFilters;
  pageSize?: number;
}

export function useFact(options?: UseFactOptions) {
  const { authenticated, loading: authLoading } = useAuthContext();
  const [filters, setFilters] = useState<FactFilters>(
    options?.initialFilters ?? createDefaultFilters()
  );
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;

  const query = useInfiniteQuery<
    FactPage,
    Error,
    InfiniteData<FactPage>,
    [string, FactFilters],
    number
  >({
    queryKey: ["facts", filters],
    queryFn: async ({ pageParam = 0, queryKey }) => {
      const [, activeFilters] = queryKey as [string, FactFilters];
      const params: FactApiParams = {
        ...toApiParams(activeFilters),
        limit: pageSize,
        offset: pageParam,
      };
      const response = await axios.get<FactRecord[]>("/api/facts/facts", {
        params,
      });
      return { items: response.data ?? [], offset: pageParam };
    },
    getNextPageParam: (lastPage) =>
      lastPage.items.length === pageSize ? lastPage.offset + pageSize : undefined,
    enabled: !authLoading,
    initialPageParam: 0,
  });

  const facts = query.data?.pages.flatMap((page) => page.items) ?? [];

  useEffect(() => {
    if (query.isFetching) {
      nprogress.start();
    } else {
      nprogress.complete();
    }
  }, [query.isFetching]);

  const loadMore = useCallback(() => {
    if (query.isFetchingNextPage || !query.hasNextPage) return;
    void query.fetchNextPage();
  }, [query]);

  const resetFilters = useCallback(() => {
    setFilters(createDefaultFilters());
  }, []);

  const refresh = useCallback(async () => {
    await query.refetch();
  }, [query]);

  const metadata = useMemo(
    () => ({
      totalLoaded: facts.length,
      isEmpty: facts.length === 0 && !query.isFetching,
    }),
    [facts.length, query.isFetching]
  );

  return {
    filters,
    setFilters,
    facts,
    loading: query.isLoading,
    loadingMore: query.isFetchingNextPage,
    hasMore: Boolean(query.hasNextPage),
    loadMore,
    resetFilters,
    refresh,
    metadata,
  };
}
