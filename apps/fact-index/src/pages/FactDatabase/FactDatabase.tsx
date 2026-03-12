import type { ChangeEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  Grid,
  TextInput,
  Button,
  Group,
  Stack,
  Alert,
  Loader,
  Container,
  Title,
  Text,
  useMantineTheme,
  useMantineColorScheme,
  Box,
  Modal,
  Tabs,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { nprogress } from "@mantine/nprogress";

import SidebarFilters from "./SidebarFilters";
import FactResultsTable from "./FactResultsTable";
import { useAuthContext } from "../../context/AuthContext";
import { useFact } from "../../hooks/useFact";
import { FaChartBar, FaPlus, FaInfoCircle, FaStar } from "react-icons/fa";
import { useRBACContext } from "@impelsysinc/react-rbac";
import type { FactRecord, TagOption } from "./types";
import { safeCanAccess } from "../../utils/safeCanAccess";

const PAGE_SIZE = 10;

export default function FactDatabase() {
  const { authenticated, loading: authLoading, hasSuperuser } = useAuthContext();
  const { canAccess } = useRBACContext();
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  const {
    filters,
    setFilters,
    facts,
    loading,
    loadingMore,
    hasMore,
    loadMore,
  } = useFact({ pageSize: PAGE_SIZE });
  const [subjects, setSubjects] = useState<TagOption[]>([]);
  const [audiences, setAudiences] = useState<TagOption[]>([]);
  const canCreateFact = hasSuperuser || safeCanAccess(canAccess, "fact:write") || safeCanAccess(canAccess, "fact:pubwrite");
  const canManageTags = hasSuperuser || safeCanAccess(canAccess, "taxonomy:write");
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagTab, setTagTab] = useState<string | null>("subject");
  const [newSubject, setNewSubject] = useState("");
  const [newAudience, setNewAudience] = useState("");
  const [tagSaving, setTagSaving] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);

  const goLink = (fact: FactRecord) => navigate(`/facts/${fact.id}`);

  const fetchSubjects = async () => {
    const res = await axios.get("/api/facts/subjects/all");
    const data = res.data?.subjects ?? res.data ?? [];
    const mapped: TagOption[] = Array.isArray(data)
      ? data.map((s, i) => (typeof s === "string" ? { id: `${i}-${s}`, name: s } : s))
      : [];
    setSubjects(mapped);
  };

  const fetchAudiences = async () => {
    const res = await axios.get("/api/facts/audiences/all");
    const data = res.data?.audiences ?? res.data ?? [];
    const mapped: TagOption[] = Array.isArray(data)
      ? data.map((s, i) => (typeof s === "string" ? { id: `${i}-${s}`, name: s } : s))
      : [];
    setAudiences(mapped);
  };

  useEffect(() => {
    if (authLoading) return;
    nprogress.start();
    fetchSubjects()
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .catch(() => {})
      .finally(() => nprogress.increment());
  }, [authLoading]);

  useEffect(() => {
    if (authLoading) return;
    fetchAudiences()
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .catch(() => {})
      .finally(() => nprogress.complete());
  }, [authLoading]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasMore || loading || loadingMore)
      return;
    const observer = new window.IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { threshold: 0.1 }
    );
    const el = loaderRef.current;
    if (el) observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
      observer.disconnect();
    };
  }, [loadMore, hasMore, loading, loadingMore]);

  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';
  const pageBackground = isDark ? theme.colors.dark[8] : theme.colors.gray[0];
  const titleColor = isDark ? theme.white : theme.colors.dark[9];

  return (
    <Box
      style={{
        backgroundColor: pageBackground,
        minHeight: '100vh',
        transition: 'background-color 150ms ease',
      }}
      py="lg"
    >
      <Modal
        opened={tagModalOpen}
        onClose={() => {
          setTagModalOpen(false);
          setTagError(null);
        }}
        title="Create new tag"
        centered
      >
        <Stack gap="md">
          {tagError && (
            <Alert color="red" title="Error">
              {tagError}
            </Alert>
          )}

          <Tabs value={tagTab} onChange={setTagTab}>
            <Tabs.List>
              <Tabs.Tab value="subject">Subject</Tabs.Tab>
              <Tabs.Tab value="audience">Audience</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="subject" pt="md">
              <Group align="flex-end" wrap="nowrap">
                <TextInput
                  label="Subject"
                  placeholder="e.g. Law"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.currentTarget.value)}
                  disabled={tagSaving}
                  style={{ flex: 1 }}
                />
                <Button
                  loading={tagSaving}
                  disabled={!newSubject.trim() || tagSaving}
                  onClick={async () => {
                    setTagError(null);
                    setTagSaving(true);
                    try {
                      await axios.post("/api/facts/subjects", { name: newSubject.trim() });
                      setNewSubject("");
                      await fetchSubjects();
                    } catch (err: any) {
                      setTagError(err?.response?.data?.message || err?.message || "Failed to create subject");
                    } finally {
                      setTagSaving(false);
                    }
                  }}
                >
                  Add
                </Button>
              </Group>
            </Tabs.Panel>

            <Tabs.Panel value="audience" pt="md">
              <Group align="flex-end" wrap="nowrap">
                <TextInput
                  label="Audience"
                  placeholder="e.g. Students"
                  value={newAudience}
                  onChange={(e) => setNewAudience(e.currentTarget.value)}
                  disabled={tagSaving}
                  style={{ flex: 1 }}
                />
                <Button
                  loading={tagSaving}
                  disabled={!newAudience.trim() || tagSaving}
                  onClick={async () => {
                    setTagError(null);
                    setTagSaving(true);
                    try {
                      await axios.post("/api/facts/audiences", { name: newAudience.trim() });
                      setNewAudience("");
                      await fetchAudiences();
                    } catch (err: any) {
                      setTagError(err?.response?.data?.message || err?.message || "Failed to create audience");
                    } finally {
                      setTagSaving(false);
                    }
                  }}
                >
                  Add
                </Button>
              </Group>
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </Modal>

      <Container fluid px={0} py="lg">
        <Stack gap="lg">
          {/* Header */}
          <Group justify="space-between" align="center">
            <Title order={1} size="2rem" fw={700} c={titleColor}>
            <Group gap="xs" align="center">
              <FaChartBar aria-hidden="true" />
              <span>TACC Fact Database</span>
            </Group>
          </Title>
          {(authenticated && (canCreateFact || canManageTags)) && (
            <Group gap="sm">
              {canCreateFact && (
                <Button
                  onClick={() => navigate("/facts/new/")}
                  variant="filled"
                  color="green"
                  size="md"
                  leftSection={<FaPlus aria-hidden="true" size={16} />}
                  fw={600}
                >
                  Add Fact
                </Button>
              )}
              {canManageTags && (
                <Button
                  variant="default"
                  size="md"
                  fw={600}
                  onClick={() => {
                    setTagTab("subject");
                    setTagModalOpen(true);
                  }}
                >
                  New Tag
                </Button>
              )}
            </Group>
          )}
        </Group>

        {/* Keyword Search */}
        <TextInput
          placeholder="Search facts by keyword..."
          style={{
            backgroundColor: isDark ? theme.colors.dark[7] : theme.white,
            borderColor: isDark ? theme.colors.dark[5] : theme.colors.gray[2],
            color: isDark ? theme.colors.gray[0] : theme.colors.dark[9],
          }}
          value={filters.keyword}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setFilters((f) => ({ ...f, keyword: e.target.value }))
          }
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter")
              setFilters((f) => ({ ...f, keyword: e.currentTarget.value }));
          }}
          leftSection={<IconSearch size={18} />}
          aria-label="Keyword search"
          size="md"
          radius="md"
        />

        {/* Main Content Grid */}
        <Grid gutter="lg">
          {/* Sidebar Filters */}
          <Grid.Col span={{ base: 12, md: 3 }}>
            <div>
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
                  <Alert
                    title="No results found"
                    color="blue"
                    icon={<FaInfoCircle aria-hidden="true" />}
                  >
                    Try adjusting your filters or creating a new fact.
                    <Button
                      mt="md"
                      onClick={() => navigate("/facts/new/")}
                      color="blue"
                      leftSection={<FaPlus aria-hidden="true" size={16} />}
                    >
                      Add your first fact
                    </Button>
                  </Alert>
                ) : (
                  <>
                    <FactResultsTable facts={facts} onRowClick={goLink} />
                    {hasMore && (
                      <div
                        ref={loaderRef}
                        aria-live="polite"
                        role="status"
                      >
                        {loadingMore ? (
                          <Group justify="center" gap="sm">
                            <Loader size="sm" />
                            <Text size="sm" c="gray.6">
                              Loading more…
                            </Text>
                          </Group>
                        ) : (
                          <Text size="sm" c="gray.6">
                            Scroll down for more facts…
                          </Text>
                        )}
                      </div>
                    )}
                    {!hasMore && facts.length > 0 && (
                      <Text size="sm" c="gray.6" component="div">
                        <Group gap="xs" align="center">
                          <FaStar aria-hidden="true" />
                          <span>You've reached the end of results.</span>
                        </Group>
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
    </Box>
  );
}
