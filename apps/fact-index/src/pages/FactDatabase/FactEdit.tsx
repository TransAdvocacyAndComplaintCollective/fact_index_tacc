import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Center,
  Container,
  Group,
  Loader,
  MultiSelect,
  Paper,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
  useMantineColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { useRBACContext } from "@impelsysinc/react-rbac";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { nprogress } from "@mantine/nprogress";
import { IconAlertCircle } from "@tabler/icons-react";
import { FaCheckCircle, FaPencilAlt, FaPlus, FaSave, FaTrash } from "react-icons/fa";
import { apiGet } from "../../utils/apiClient";
import type { FactRecord } from "./types";
import { useAuthContext } from "../../context/AuthContext";
import { safeCanAccess } from "../../utils/safeCanAccess";

type FactFormValues = {
  fact_text: string;
  source: string;
  subjects: string[];
  audiences: string[];
  context: string;
  is_public: boolean;
  reason: string;
};

type FactEditProps = {
  fact?: FactRecord | null;
  mode: "edit" | "create";
  onSave?: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
};

function FactEdit({ fact, mode, onSave, onCancel, onDelete }: FactEditProps) {
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";
  const titleColor = isDark ? theme.white : theme.colors.dark[9];
  const isEdit = mode === "edit";
  const [isSaving, setIsSaving] = useState(false);
  const { canAccess } = useRBACContext();
  const { authenticated, hasSuperuser } = useAuthContext();
  const canPublish = hasSuperuser || safeCanAccess(canAccess, "fact:pubwrite");
  const canWrite = hasSuperuser || safeCanAccess(canAccess, "fact:write") || canPublish;
  const canDelete = hasSuperuser || safeCanAccess(canAccess, "fact:admin");
  const canDeleteThisFact = canDelete && (!Boolean((fact as any)?.is_public) || canPublish);
  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  const [audienceOptions, setAudienceOptions] = useState<string[]>([]);

  function normalizeValues(values: unknown): string[] {
    if (!Array.isArray(values)) return [];
    return values.map((v) => String(v).trim()).filter(Boolean);
  }

  const initialValues = useMemo<FactFormValues>(
    () => ({
      fact_text: fact?.fact_text || "",
      source: fact?.source || "",
      subjects: normalizeValues((fact as any)?.subjects),
      audiences: normalizeValues((fact as any)?.audiences),
      context: fact?.context || "",
      is_public: Boolean(fact?.is_public),
      reason: "",
    }),
    [fact?.context, fact?.fact_text, fact?.is_public, fact?.source, fact],
  );

  const form = useForm<FactFormValues>({
    initialValues,
    validate: {
      fact_text: (value) => {
        if (!value?.trim()) return "Fact text is required";
        if (value.trim().length < 5) return "Fact text must be at least 5 characters";
        return null;
      },
      source: (value) => {
        if (value && !value.match(/^https?:\/\//)) return "Source must be a valid URL";
        return null;
      },
      reason: (value) => {
        if (isEdit && !value?.trim()) return "Edit reason is required";
        return null;
      },
    },
  });

  useEffect(() => {
    apiGet<{ subjects: string[] }>("/api/facts/subjects/all")
      .then((res) => {
        const subjects = Array.isArray(res?.subjects)
          ? res.subjects.map((s) => String(s).trim()).filter(Boolean)
          : [];
        setSubjectOptions(subjects);
      })
      .catch(() => {
        setSubjectOptions([]);
      });
  }, []);

  useEffect(() => {
    apiGet<{ audiences: string[] }>("/api/facts/audiences/all")
      .then((res) => {
        const audiences = Array.isArray(res?.audiences)
          ? res.audiences.map((s) => String(s).trim()).filter(Boolean)
          : [];
        setAudienceOptions(audiences);
      })
      .catch(() => {
        setAudienceOptions([]);
      });
  }, []);

  useEffect(() => {
    form.setValues(initialValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues]);

  const originalSubjects = useMemo(() => normalizeValues((fact as any)?.subjects), [fact]);
  const originalAudiences = useMemo(() => normalizeValues((fact as any)?.audiences), [fact]);
  const isDirty =
    form.values.fact_text !== (fact?.fact_text || "") ||
    form.values.source !== (fact?.source || "") ||
    form.values.subjects.join("|") !== originalSubjects.join("|") ||
    form.values.audiences.join("|") !== originalAudiences.join("|") ||
    form.values.context !== (fact?.context || "");

  async function handleSubmit(values: FactFormValues) {
    const validation = form.validate();
    if (validation.hasErrors) return;

    if (isEdit && !isDirty) {
      notifications.show({
        title: "No changes",
        message: "You haven't made any changes to this fact.",
        color: "blue",
        icon: <IconAlertCircle />,
      });
      return;
    }

    const factId = fact?.id;
    if (isEdit && !factId) {
      notifications.show({
        title: "Missing fact",
        message: "Cannot update a fact that is not loaded.",
        color: "red",
      });
      return;
    }

    nprogress.start();
    setIsSaving(true);
    try {
      if (isEdit) {
        const firstSubject = values.subjects[0];
        await axios.put(`/api/facts/facts/${factId}`, {
          changes: {
            fact_text: values.fact_text,
            source: values.source,
            ...(firstSubject ? { type: firstSubject } : {}),
            subjects: values.subjects,
            audiences: values.audiences,
            context: values.context,
          },
          reason: values.reason,
        });
        notifications.show({
          title: "Success",
          message: "Fact updated successfully!",
          color: "green",
          autoClose: 3000,
        });
      } else {
        const firstSubject = values.subjects[0];
        await axios.post(`/api/facts/facts/`, {
          fact_text: values.fact_text,
          source: values.source,
          ...(firstSubject ? { type: firstSubject } : {}),
          subjects: values.subjects,
          audiences: values.audiences,
          context: values.context,
          is_public: canPublish ? values.is_public : false,
        });
        notifications.show({
          title: "Success",
          message: "Fact created successfully!",
          color: "green",
          autoClose: 3000,
        });
      }

      onSave?.();
    } catch (error) {
      const axiosMessage = axios.isAxiosError(error) ? (error.response?.data as any)?.error : undefined;
      notifications.show({
        title: "Error",
        message: axiosMessage || "Failed to save fact.",
        color: "red",
        autoClose: 4000,
      });
    } finally {
      setIsSaving(false);
      nprogress.complete();
    }
  }

  async function handleDelete() {
    const factId = fact?.id;
    if (!isEdit || !factId) return;
    if (!window.confirm("Delete this fact? This cannot be undone.")) return;

    nprogress.start();
    setIsSaving(true);
    try {
      await axios.delete(`/api/facts/facts/${factId}`);
      notifications.show({
        title: "Deleted",
        message: "Fact deleted successfully.",
        color: "green",
        autoClose: 3000,
      });
      onDelete?.();
    } catch (error) {
      const axiosMessage = axios.isAxiosError(error) ? (error.response?.data as any)?.error : undefined;
      notifications.show({
        title: "Error",
        message: axiosMessage || "Failed to delete fact.",
        color: "red",
        autoClose: 4000,
      });
    } finally {
      setIsSaving(false);
      nprogress.complete();
    }
  }

  return (
    <Container size="sm" py="xl">
      {!authenticated && (
        <Alert color="orange" variant="light" title="Login required">
          <Text size="sm">You must be logged in to create a fact.</Text>
        </Alert>
      )}
      {authenticated && !canWrite && (
        <Alert color="orange" variant="light" title="No permission">
          <Text size="sm">You do not have permission to create facts.</Text>
        </Alert>
      )}
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Paper withBorder radius="md" p="lg">
          <Stack gap="lg">
            <Title order={2} fw={700} c={titleColor}>
              <Group gap="xs" align="center">
                {isEdit ? <FaPencilAlt aria-hidden="true" /> : <FaPlus aria-hidden="true" />}
                <span>{isEdit ? "Edit Fact" : "Create New Fact"}</span>
              </Group>
            </Title>

            <Stack gap="md">
              <Switch
                label="Public fact"
                description={canPublish ? "Visible to anyone (including logged-out users)." : "Requires fact:pubwrite permission."}
                disabled={isSaving || !canPublish}
                checked={form.values.is_public}
                onChange={(event) => form.setFieldValue("is_public", event.currentTarget.checked)}
              />

              <Textarea
                label="Fact Text"
                labelProps={{ fw: 600 }}
                required
                placeholder="Enter the fact..."
                disabled={isSaving}
                size="md"
                minRows={4}
                {...form.getInputProps("fact_text")}
              />

              <TextInput
                label="Source URL"
                labelProps={{ fw: 600 }}
                type="url"
                placeholder="https://example.com"
                disabled={isSaving}
                size="md"
                {...form.getInputProps("source")}
              />

              <MultiSelect
                label="Subjects"
                labelProps={{ fw: 600 }}
                placeholder="Select subjects..."
                disabled={isSaving}
                size="md"
                data={Array.from(
                  new Set([
                    ...subjectOptions,
                    ...form.values.subjects,
                    ...originalSubjects,
                  ]),
                ).map((value) => ({ value, label: value }))}
                searchable
                clearable
                hidePickedOptions
                creatable
                getCreateLabel={(query) => `+ Add "${query}"`}
                onCreate={(query) => {
                  const value = query.trim();
                  if (!value) return null;
                  setSubjectOptions((prev) => (prev.includes(value) ? prev : [...prev, value]));
                  return value;
                }}
                value={form.values.subjects}
                onChange={(value) => form.setFieldValue("subjects", value)}
              />

              <MultiSelect
                label="Audiences"
                labelProps={{ fw: 600 }}
                placeholder="Select audiences..."
                disabled={isSaving}
                size="md"
                data={Array.from(
                  new Set([
                    ...audienceOptions,
                    ...form.values.audiences,
                    ...originalAudiences,
                  ]),
                ).map((value) => ({ value, label: value }))}
                searchable
                clearable
                hidePickedOptions
                creatable
                getCreateLabel={(query) => `+ Add "${query}"`}
                onCreate={(query) => {
                  const value = query.trim();
                  if (!value) return null;
                  setAudienceOptions((prev) => (prev.includes(value) ? prev : [...prev, value]));
                  return value;
                }}
                value={form.values.audiences}
                onChange={(value) => form.setFieldValue("audiences", value)}
              />

              <Textarea
                label="Context"
                labelProps={{ fw: 600 }}
                placeholder="Optional context..."
                disabled={isSaving}
                size="md"
                minRows={3}
                {...form.getInputProps("context")}
              />

              {isEdit && (
                <TextInput
                  label="Edit Reason"
                  labelProps={{ fw: 600 }}
                  required
                  placeholder="Why are you editing this fact?"
                  disabled={isSaving}
                  size="md"
                  {...form.getInputProps("reason")}
                />
              )}
            </Stack>

            <Group justify="flex-end" gap="md">
              {isEdit && authenticated && canDeleteThisFact && (
                <Button
                  type="button"
                  color="red"
                  variant="light"
                  onClick={handleDelete}
                  disabled={isSaving}
                  leftSection={<FaTrash aria-hidden="true" />}
                >
                  Delete
                </Button>
              )}
              <Button type="button" variant="default" onClick={onCancel} disabled={isSaving}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={isSaving}
                disabled={!authenticated || !canWrite || isSaving || (isEdit && !isDirty)}
                leftSection={isEdit ? <FaSave aria-hidden="true" /> : <FaCheckCircle aria-hidden="true" />}
              >
                {isEdit ? "Save Changes" : "Create Fact"}
              </Button>
            </Group>
          </Stack>
        </Paper>
      </form>
    </Container>
  );
}

FactEdit.propTypes = {
  fact: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    fact_text: PropTypes.string,
    source: PropTypes.string,
    type: PropTypes.string,
    context: PropTypes.string,
  }),
  mode: PropTypes.oneOf(["edit", "create"]).isRequired,
  onSave: PropTypes.func,
  onCancel: PropTypes.func,
};

export { FactEdit };

export default function FactEditRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";
  const pageBackground = isDark ? theme.colors.dark[8] : theme.colors.gray[0];

  const [fact, setFact] = React.useState<FactRecord | null>(
    id ? null : { fact_text: "", source: "", type: "", context: "", subjects: [], audiences: [] } as any,
  );
  const [loading, setLoading] = React.useState(Boolean(id));

  useEffect(() => {
    if (!id) return;
    nprogress.start();
    setLoading(true);
    apiGet<FactRecord>(`/api/facts/facts/${id}`)
      .then(setFact)
      .catch(() => setFact(null))
      .finally(() => {
        setLoading(false);
        nprogress.complete();
      });
  }, [id]);

  if (loading) {
    return (
      <Paper style={{ backgroundColor: pageBackground, minHeight: "100vh", paddingBlock: theme.spacing.xl }} radius={0} p={0}>
        <Container size="sm" py="xl">
          <Center>
            <Stack align="center" gap="md">
              <Loader />
              <Text c="gray.6">Loading fact...</Text>
            </Stack>
          </Center>
        </Container>
      </Paper>
    );
  }

  if (id && !fact) {
    return (
      <Paper style={{ backgroundColor: pageBackground, minHeight: "100vh", paddingBlock: theme.spacing.xl }} radius={0} p={0}>
        <Container size="sm" py="xl">
          <Alert title="Not found" color="red">
            This fact could not be found.
          </Alert>
        </Container>
      </Paper>
    );
  }

  return (
    <Paper
      style={{
        backgroundColor: pageBackground,
        minHeight: "100vh",
        paddingBlock: theme.spacing.xl,
        transition: "background-color 150ms ease",
      }}
      radius={0}
      p={0}
    >
      <FactEdit
        fact={fact}
        mode={id ? "edit" : "create"}
        onSave={() => (id ? navigate(`/facts/${id}`) : navigate(`/facts`))}
        onCancel={() => (id ? navigate(`/facts/${id}`) : navigate(`/facts`))}
        onDelete={() => navigate(`/facts`)}
      />
    </Paper>
  );
}
