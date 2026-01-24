import React, { useEffect } from "react";
import PropTypes from "prop-types";
import axios from "axios";
import { useParams, useNavigate } from "react-router-dom";
import { TextInput, Textarea, Button, Group, Stack, Container, Title, Loader, Center, Alert } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { nprogress } from "@mantine/nprogress";
import { IconAlertCircle } from "@tabler/icons-react";

export function FactEdit({ fact, mode, onSave, onCancel }) {
  const isEdit = mode === "edit";

  const form = useForm({
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

  async function handleSubmit(values) {
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
    try {
      if (isEdit) {
        await axios.put(`/api/facts/facts/${fact.id}`, {
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
    } catch (e) {
      notifications.show({
        title: "Error",
        message: e.response?.data?.error || "Failed to save fact.",
        color: "red",
        autoClose: 4000,
      });
    } finally {
      nprogress.complete();
    }
  }

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack gap="lg">
        {/* Form Header */}
        <div style={{
          borderBottom: '3px solid var(--mantine-color-blue-6)',
          paddingBottom: '1rem'
        }}>
          <Title order={2} fw={700} style={{ color: 'var(--mantine-color-blue-6)' }}>
            {isEdit ? "✏️ Edit Fact" : "➕ Create New Fact"}
          </Title>
        </div>

        <Stack gap="md">
          <Textarea
            label="Fact Text"
            labelProps={{ fw: 600 }}
            required
            placeholder="Enter the fact..."
            disabled={form.isSubmitting}
            size="md"
            minRows={4}
            {...form.getInputProps("fact_text")}
            styles={{
              input: { 
                backgroundColor: 'var(--mantine-color-gray-1)',
                border: '2px solid var(--mantine-color-gray-3)',
                '&:focus': {
                  borderColor: 'var(--mantine-color-blue-6)'
                }
              }
            }}
          />
          
          <TextInput
            label="Source URL"
            labelProps={{ fw: 600 }}
            type="url"
            placeholder="https://example.com"
            disabled={form.isSubmitting}
            size="md"
            {...form.getInputProps("source")}
            styles={{
              input: { 
                backgroundColor: 'var(--mantine-color-gray-1)',
                border: '2px solid var(--mantine-color-gray-3)',
                '&:focus': {
                  borderColor: 'var(--mantine-color-blue-6)'
                }
              }
            }}
          />
          
          <TextInput
            label="Type (Category)"
            labelProps={{ fw: 600 }}
            placeholder="E.g.: statistic, quote, law, study"
            disabled={form.isSubmitting}
            size="md"
            {...form.getInputProps("type")}
            styles={{
              input: { 
                backgroundColor: 'var(--mantine-color-gray-1)',
                border: '2px solid var(--mantine-color-gray-3)',
                '&:focus': {
                  borderColor: 'var(--mantine-color-blue-6)'
                }
              }
            }}
          />
          
          <Textarea
            label="Context"
            labelProps={{ fw: 600 }}
            placeholder="Provide additional context for this fact..."
            disabled={form.isSubmitting}
            size="md"
            minRows={3}
            {...form.getInputProps("context")}
            styles={{
              input: { 
                backgroundColor: 'var(--mantine-color-gray-1)',
                border: '2px solid var(--mantine-color-gray-3)',
                '&:focus': {
                  borderColor: 'var(--mantine-color-blue-6)'
                }
              }
            }}
          />
          
          {isEdit && (
            <TextInput
              label="Edit Reason"
              labelProps={{ fw: 600 }}
              required
              placeholder="Why are you editing this fact?"
              disabled={form.isSubmitting}
              size="md"
              {...form.getInputProps("reason")}
              styles={{
                input: { 
                  backgroundColor: 'var(--mantine-color-yellow-0)',
                  border: '2px solid var(--mantine-color-yellow-3)',
                  '&:focus': {
                    borderColor: 'var(--mantine-color-yellow-6)'
                  }
                }
              }}
            />
          )}
        </Stack>
        
        <Group justify="flex-end" gap="md" mt="lg">
          <Button
            type="button"
            variant="default"
            onClick={onCancel}
            disabled={form.isSubmitting}
            size="md"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            color="blue"
            loading={form.isSubmitting}
            size="md"
            fw={600}
            disabled={!form.isValid() || (isEdit && !isDirty)}
          >
            {isEdit ? "💾 Save Changes" : "✅ Create Fact"}
          </Button>
        </Group>
      </Stack>
    </form>
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

export default function FactEditRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [fact, setFact] = React.useState(id ? null : { fact_text: "", source: "", type: "", context: "" });
  const [loading, setLoading] = React.useState(Boolean(id));

  useEffect(() => {
    if (!id) {
      setLoading(false);
      nprogress.complete();
      return;
    }
    nprogress.start();
    setLoading(true);
    fetch(`/api/facts/${id}`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(setFact)
      .catch(() => setFact(null))
      .finally(() => {
        setLoading(false);
        nprogress.complete();
      });
  }, [id]);

  if (loading) return (
    <Container size="sm" py="xl">
      <Center>
        <Stack align="center" gap="md">
          <Loader />
          <span>Loading fact...</span>
        </Stack>
      </Center>
    </Container>
  );
  if (id && !fact) return (
    <Container size="sm" py="xl">
      <Alert title="Not found" color="red">This fact could not be found.</Alert>
    </Container>
  );

  return (
    <Container size="sm" py="xl">
      <FactEdit
        fact={fact}
        mode={id ? "edit" : "create"}
        onSave={() => id ? navigate(`/facts/${id}`) : navigate(`/facts`)}
        onCancel={() => id ? navigate(`/facts/${id}`) : navigate(`/facts`)}
      />
    </Container>
  );
}
