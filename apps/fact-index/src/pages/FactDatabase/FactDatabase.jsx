import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Grid, TextInput, Button, Group, Stack, Alert, Loader, Container, Title, Text } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { nprogress } from "@mantine/nprogress";

import SidebarFilters from "./SidebarFilters";
import FactResultsTable from "./FactResultsTable";

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
    nprogress.start();
    axios.get("/api/facts/subjects")
      .then(res => {
        const data = res.data?.subjects ?? res.data ?? [];
        const mapped = Array.isArray(data)
          ? data.map((s, i) => (typeof s === 'string' ? { id: `${i}-${s}`, name: s } : s))
          : [];
        setSubjects(mapped);
      })
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .catch(() => {})
      .finally(() => nprogress.increment());
    
    axios.get("/api/facts/audiences")
      .then(res => {
        const data = res.data?.audiences ?? res.data ?? [];
        const mapped = Array.isArray(data)
          ? data.map((s, i) => (typeof s === 'string' ? { id: `${i}-${s}`, name: s } : s))
          : [];
        setAudiences(mapped);
      })
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .catch(() => {})
      .finally(() => nprogress.complete());
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
    nprogress.start();
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
      .finally(() => {
        setLoading(false);
        nprogress.complete();
      });
  }, [filters]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    nprogress.start();
    setLoadingMore(true);
    axios.get("/api/facts/facts", {
      params: { ...filtersToApiParams(filters), limit: PAGE_SIZE, offset: facts.length }
    })
      .then(res => {
        setFacts(prev => [...prev, ...res.data]);
        setHasMore(res.data.length === PAGE_SIZE);
      })
      .catch(() => setHasMore(false))
      .finally(() => {
        setLoadingMore(false);
        nprogress.complete();
      });
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
    <Container size="xl" py="lg">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between" align="center" style={{
          borderBottom: '3px solid var(--mantine-color-blue-6)',
          paddingBottom: '1rem',
          marginBottom: '1rem'
        }}>
          <Title order={1} size="2rem" fw={700} style={{ color: 'var(--mantine-color-blue-6)' }}>
            📊 TACC Fact Database
          </Title>
          <Button
            onClick={() => navigate("/facts/new/")}
            variant="filled"
            color="green"
            size="md"
            leftSection="➕"
            fw={600}
          >
            Add Fact
          </Button>
        </Group>

        {/* Keyword Search */}
        <TextInput
          placeholder="🔍 Search facts by keyword..."
          value={filters.keyword}
          onChange={e => setFilters(f => ({ ...f, keyword: e.target.value }))}
          onKeyDown={e => {
            if (e.key === "Enter") setFilters(f => ({ ...f, keyword: e.target.value }));
          }}
          leftSection={<IconSearch size={18} />}
          aria-label="Keyword search"
          size="md"
          radius="md"
          styles={{
            input: { 
              backgroundColor: 'var(--mantine-color-gray-0)',
              border: '2px solid var(--mantine-color-blue-3)',
              transition: 'all 0.2s ease',
              '&:focus': {
                borderColor: 'var(--mantine-color-blue-6)'
              }
            }
          }}
        />

        {/* Main Content Grid */}
        <Grid gutter="lg">
          {/* Sidebar Filters */}
          <Grid.Col span={{ base: 12, md: 3 }}>
            <div style={{
              position: 'sticky',
              top: '20px',
              zIndex: 10
            }}>
              <SidebarFilters
                filters={filters}
                setFilters={setFilters}
                subjects={subjects}
                audiences={audiences}
              />
            </div>
          </Grid.Col>

          {/* Results */}
          <Grid.Col span={{ base: 12, md: 9 }}>
            {loading && (
              <Group justify="center" py="xl">
                <Loader />
              </Group>
            )}
            {!loading && (
              <Stack gap="lg">
                {facts.length === 0 ? (
                  <Alert title="No results found" color="blue" icon="ℹ️">
                    Try adjusting your filters or creating a new fact.
                    <Button mt="md" onClick={() => navigate('/facts/new/')} variant="light" color="blue" leftSection="➕">
                      Add your first fact
                    </Button>
                  </Alert>
                ) : (
                  <>
                    <FactResultsTable facts={facts} onRowClick={goLink} selectedFact={false} />
                    {hasMore && (
                      <div
                        ref={loaderRef}
                        style={{ textAlign: 'center', padding: '20px' }}
                        aria-live="polite"
                        role="status"
                      >
                        {loadingMore ? (
                          <Group justify="center" gap="sm">
                            <Loader size="sm" />
                            <span style={{ color: 'var(--mantine-color-gray-5)' }}>Loading more…</span>
                          </Group>
                        ) : (
                          <Text size="sm" c="dimmed">Scroll down for more facts…</Text>
                        )}
                      </div>
                    )}
                    {!hasMore && facts.length > 0 && (
                      <Text size="sm" c="dimmed" style={{ textAlign: 'center', paddingTop: '1rem' }}>
                        ✨ You've reached the end of results.
                      </Text>
                    )}
                  </>
                )}
              </Stack>
            )}
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}
