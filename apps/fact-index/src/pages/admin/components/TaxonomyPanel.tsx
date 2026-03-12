import React, { useMemo, useState } from "react";
import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Group, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import { useRBACContext } from "@impelsysinc/react-rbac";
import { useAuthContext } from "../../../context/AuthContext";
import { safeCanAccess } from "../../../utils/safeCanAccess";

type TaxonomyListResponse = { subjects?: string[]; audiences?: string[] };

const SUBJECTS_QUERY_KEY = ["facts", "subjects", "all"];
const AUDIENCES_QUERY_KEY = ["facts", "audiences", "all"];

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim()).filter(Boolean);
}

export default function TaxonomyPanel() {
  const queryClient = useQueryClient();
  const { canAccess } = useRBACContext();
  const { isAdmin, hasSuperuser } = useAuthContext();

  const canWriteTaxonomy = hasSuperuser || isAdmin || safeCanAccess(canAccess, "taxonomy:write");
  const canReadTaxonomy = canWriteTaxonomy || safeCanAccess(canAccess, "taxonomy:read");

  const [newSubject, setNewSubject] = useState("");
  const [newAudience, setNewAudience] = useState("");

  const subjectsQuery = useQuery<string[]>({
    queryKey: SUBJECTS_QUERY_KEY,
    queryFn: async () => {
      const res = await axios.get<TaxonomyListResponse>("/api/facts/subjects/all");
      return normalizeList((res.data as any)?.subjects ?? (res.data as any));
    },
    enabled: canReadTaxonomy,
  });

  const audiencesQuery = useQuery<string[]>({
    queryKey: AUDIENCES_QUERY_KEY,
    queryFn: async () => {
      const res = await axios.get<TaxonomyListResponse>("/api/facts/audiences/all");
      return normalizeList((res.data as any)?.audiences ?? (res.data as any));
    },
    enabled: canReadTaxonomy,
  });

  const createSubjectMutation = useMutation({
    mutationFn: async (name: string) => {
      await axios.post("/api/facts/subjects", { name });
    },
    onSuccess: () => {
      setNewSubject("");
      queryClient.invalidateQueries({ queryKey: SUBJECTS_QUERY_KEY });
    },
  });

  const createAudienceMutation = useMutation({
    mutationFn: async (name: string) => {
      await axios.post("/api/facts/audiences", { name });
    },
    onSuccess: () => {
      setNewAudience("");
      queryClient.invalidateQueries({ queryKey: AUDIENCES_QUERY_KEY });
    },
  });

  const subjects = useMemo(() => (subjectsQuery.data ?? []).slice().sort((a, b) => a.localeCompare(b)), [subjectsQuery.data]);
  const audiences = useMemo(() => (audiencesQuery.data ?? []).slice().sort((a, b) => a.localeCompare(b)), [audiencesQuery.data]);

  if (!canReadTaxonomy) {
    return (
      <Alert title="Access denied" color="red">
        <Text>You do not have permission to manage Subjects/Audiences.</Text>
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      <Stack gap={4}>
        <Title order={3}>Subjects & Audiences</Title>
        <Text size="sm" c="dimmed">
          Add taxonomy items so they appear in the Fact editor and filters.
        </Text>
      </Stack>

      <Group align="flex-start" grow>
        <Paper withBorder p="md" radius="md">
          <Stack gap="sm">
            <Title order={4}>Subjects</Title>
            <Group align="flex-end" wrap="nowrap">
              <TextInput
                label="New subject"
                placeholder="e.g. Law"
                value={newSubject}
                onChange={(e) => setNewSubject(e.currentTarget.value)}
                disabled={!canWriteTaxonomy || createSubjectMutation.isPending}
              />
              <Button
                onClick={() => {
                  const name = newSubject.trim();
                  if (!name) return;
                  createSubjectMutation.mutate(name);
                }}
                disabled={!canWriteTaxonomy || !newSubject.trim() || createSubjectMutation.isPending}
                loading={createSubjectMutation.isPending}
              >
                Add
              </Button>
            </Group>
            {createSubjectMutation.isError && (
              <Alert title="Failed to add subject" color="red">
                {String((createSubjectMutation.error as any)?.message || createSubjectMutation.error)}
              </Alert>
            )}
            <Stack gap={4}>
              {subjects.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No subjects yet.
                </Text>
              ) : (
                subjects.map((s) => (
                  <Text key={s} size="sm">
                    {s}
                  </Text>
                ))
              )}
            </Stack>
          </Stack>
        </Paper>

        <Paper withBorder p="md" radius="md">
          <Stack gap="sm">
            <Title order={4}>Audiences</Title>
            <Group align="flex-end" wrap="nowrap">
              <TextInput
                label="New audience"
                placeholder="e.g. Students"
                value={newAudience}
                onChange={(e) => setNewAudience(e.currentTarget.value)}
                disabled={!canWriteTaxonomy || createAudienceMutation.isPending}
              />
              <Button
                onClick={() => {
                  const name = newAudience.trim();
                  if (!name) return;
                  createAudienceMutation.mutate(name);
                }}
                disabled={!canWriteTaxonomy || !newAudience.trim() || createAudienceMutation.isPending}
                loading={createAudienceMutation.isPending}
              >
                Add
              </Button>
            </Group>
            {createAudienceMutation.isError && (
              <Alert title="Failed to add audience" color="red">
                {String((createAudienceMutation.error as any)?.message || createAudienceMutation.error)}
              </Alert>
            )}
            <Stack gap={4}>
              {audiences.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No audiences yet.
                </Text>
              ) : (
                audiences.map((a) => (
                  <Text key={a} size="sm">
                    {a}
                  </Text>
                ))
              )}
            </Stack>
          </Stack>
        </Paper>
      </Group>
    </Stack>
  );
}
