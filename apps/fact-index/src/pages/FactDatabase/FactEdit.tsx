import React, { useEffect } from "react";
import PropTypes from "prop-types";
import axios from "axios";
import { useParams, useNavigate } from "react-router-dom";
import { TextInput, Textarea, Button, Group, Stack, Container, Title, Loader, Center, Alert, Text, useMantineTheme, useMantineColorScheme, Box } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { nprogress } from "@mantine/nprogress";
import { IconAlertCircle } from "@tabler/icons-react";
import { FaPencilAlt, FaPlus, FaSave, FaCheckCircle } from "react-icons/fa";
import { apiGet } from "../../utils/apiClient";
import type { FactRecord } from "./types";

interface FactFormValues {
  fact_text: string;
  source: string;
  type: string;
  context: string;
  reason: string;
}

interface FactEditProps {
  fact?: FactRecord | null;
  mode: "edit" | "create";
  onSave?: () => void;
  onCancel?: () => void;
}

function FactEdit({ fact, mode, onSave, onCancel }: FactEditProps) {
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';
  const formBgColor = isDark ? theme.colors.dark[7] : theme.white;
  const titleColor = isDark ? theme.white : theme.colors.dark[9];
  const isEdit = mode === "edit";

  const form = useForm<FactFormValues>({
    initialValues: {
      fact_text: fact?.fact_text || "",
      source: fact?.source || "",
      type: fact?.type || "",
      context: fact?.context || "",
      reason: "",
    },
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

  const isDirty =
    form.values.fact_text !== (fact?.fact_text || "") ||
    form.values.source !== (fact?.source || "") ||
    form.values.type !== (fact?.type || "") ||
    form.values.context !== (fact?.context || "");

  async function handleSubmit(values: FactFormValues) {
    if (isEdit && !isDirty) {
      notifications.show({
        title: "No changes",
        message: "You haven't made any changes to this fact.",
        color: "blue",
        icon: <IconAlertCircle />,
      });
      return;
    }

    nprogress.start();
    const factId = fact?.id;
    if (isEdit && !factId) {
      notifications.show({
        title: "Missing fact",
        message: "Cannot update a fact that is not loaded.",
        color: "red",
      });
      return;
    }

    try {
      if (isEdit) {
        await axios.put(`/api/facts/facts/${factId}`, {
          changes: {
            fact_text: values.fact_text,
            source: values.source,
            type: values.type,
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
        await axios.post(`/api/facts/facts/`, {
          fact_text: values.fact_text,
          source: values.source,
          type: values.type,
          context: values.context,
        });
        notifications.show({
          title: "Success",
          message: "Fact created successfully!",
          color: "green",
          autoClose: 3000,
        });
      }
      if (onSave) onSave();
    } catch (error) {
      const axiosMessage = axios.isAxiosError(error)
        ? error.response?.data?.error
        : undefined;
      notifications.show({
        title: "Error",
        message: axiosMessage || "Failed to save fact.",
        color: "red",
        autoClose: 4000,
      });
    } finally {
      nprogress.complete();
    }
  }

  return (
    <Box
      style={{
        backgroundColor: isDark ? theme.colors.dark[6] : theme.colors.gray[0],
        minHeight: '100vh',
        paddingBlock: theme.spacing.xl,
        transition: 'background-color 150ms ease',
      }}
    >
      <Container size="sm" py="xl">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Box
            style={{
              backgroundColor: formBgColor,
              padding: theme.spacing.lg,
              borderRadius: theme.radius.md,
              transition: 'background-color 150ms ease',
            }}
          >
            <Stack gap="lg">
              {/* Form Header */}
              <div>
                <Title order={2} fw={700} c={titleColor}>
            <Group gap="xs" align="center">
              {isEdit ? (
                <FaPencilAlt aria-hidden="true" />
              ) : (
                <FaPlus aria-hidden="true" />
              )}
              <span>{isEdit ? "Edit Fact" : "Create New Fact"}</span>
            </Group>
          </Title>
        </div>

        <Stack gap="md">
          <Textarea
            label="Fact Text"
            labelProps={{ fw: 600 }}
            required
            placeholder="Enter the fact..."
            disabled={form.submitting}
            size="md"
            minRows={4}
            {...form.getInputProps("fact_text")}
   
          />
          
          <TextInput
            label="Source URL"
            labelProps={{ fw: 600 }}
            type="url"
            placeholder="https://example.com"
            disabled={form.submitting}
            size="md"
            {...form.getInputProps("source")}

          />
          
          <TextInput
            label="Type (Category)"
            labelProps={{ fw: 600 }}
            placeholder="E.g.: statistic, quote, law, study"
            disabled={form.submitting}
            size="md"
            {...form.getInputProps("type")}

          />
          
          <Textarea
            label="Context"
            labelProps={{ fw: 600 }}
            placeholder="Provide additional context for this fact..."
            disabled={form.submitting}
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
              disabled={form.submitting}
              size="md"
              {...form.getInputProps("reason")}
   
            />
          )}
        </Stack>
        
        <Group justify="flex-end" gap="md" mt="lg">
          <Button
            type="button"
            variant="default"
            onClick={onCancel}
            disabled={form.submitting}
            size="md"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            color="blue"
            loading={form.submitting}
            size="md"
            fw={600}
            disabled={!form.isValid() || (isEdit && !isDirty)}
            leftSection={isEdit ? <FaSave aria-hidden="true" /> : <FaCheckCircle aria-hidden="true" />}
          >
            {isEdit ? "Save Changes" : "Create Fact"}
            </Button>
            </Group>
            </Stack>
          </Box>
        </form>
      </Container>
    </Box>
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
  const isDark = colorScheme === 'dark';
  const pageBackground = isDark ? theme.colors.dark[8] : theme.colors.gray[0];
  const [fact, setFact] = React.useState<FactRecord | null>(id ? null : { fact_text: "", source: "", type: "", context: "" });
  const [loading, setLoading] = React.useState(Boolean(id));

  useEffect(() => {
    if (!id) {
      nprogress.complete();
      return;
    }
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

  if (loading) return (
    <Box style={{ backgroundColor: pageBackground, minHeight: '100vh', paddingBlock: theme.spacing.xl }}>
      <Container size="sm" py="xl">
        <Center>
          <Stack align="center" gap="md">
            <Loader />
            <Text c="gray.6">Loading fact...</Text>
          </Stack>
        </Center>
      </Container>
    </Box>
  );
  if (id && !fact) return (
    <Box style={{ backgroundColor: pageBackground, minHeight: '100vh', paddingBlock: theme.spacing.xl }}>
      <Container size="sm" py="xl">
        <Alert title="Not found" color="red">This fact could not be found.</Alert>
      </Container>
    </Box>
  );

  return (
    <Box style={{ backgroundColor: pageBackground, minHeight: '100vh', paddingBlock: theme.spacing.xl, transition: 'background-color 150ms ease' }}>
      <FactEdit
        fact={fact}
        mode={id ? "edit" : "create"}
        onSave={() => id ? navigate(`/facts/${id}`) : navigate(`/facts`)}
        onCancel={() => id ? navigate(`/facts/${id}`) : navigate(`/facts`)}
      />
    </Box>
  );
}
