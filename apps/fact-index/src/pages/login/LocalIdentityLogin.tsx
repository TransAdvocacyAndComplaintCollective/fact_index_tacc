/**
 * Local Dev Login
 * Allows users to enter a username for local/dev authentication
 */

import React, { useState } from "react";
import {
  Container,
  Paper,
  Title,
  Stack,
  TextInput,
  MultiSelect,
  Button,
  Group,
  Alert,
  Text,
  Loader,
  Divider,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconArrowLeft,
  IconUser,
} from "@tabler/icons-react";

interface LocalIdentityLoginProps {
  onBack?: () => void;
}

export default function LocalIdentityLogin({ onBack }: LocalIdentityLoginProps) {
  const [username, setUsername] = useState("");
  const [allActions, setAllActions] = useState(false);
  const [actions, setActions] = useState<string[]>([]);
  const [actionOptions, setActionOptions] = useState<string[]>([
    "fact:read",
    "fact:write",
    "fact:pubwrite",
    "fact:admin",
    "fact:superuser",
    "taxonomy:read",
    "taxonomy:write",
    "admin:read",
    "admin:write",
    "idc:login",
    "superuser",
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim()) {
      setError("Please enter a username");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Redirect to the dev login endpoint with username
      const params = new URLSearchParams({
        user: username.trim(),
        ...(allActions
          ? { actions: "all" }
          : actions.length
          ? { actions: actions.join(",") }
          : {}),
      });

      window.location.href = `/auth/dev?${params.toString()}`;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Login failed. Please try again."
      );
      setLoading(false);
    }
  };

  return (
    <Container size="xs" pt="xl" role="main" aria-labelledby="identity-login-title">
      <Paper withBorder shadow="sm" p="md" radius="md">
        <Stack gap="xs" mb="md">
          <Group justify="space-between" align="center">
            <Title order={3} id="identity-login-title">
              Local Dev Login
            </Title>
            {onBack && (
              <Button
                variant="subtle"
                size="xs"
                leftSection={<IconArrowLeft size={16} />}
                onClick={onBack}
                aria-label="Back to login"
              >
                Back
              </Button>
            )}
          </Group>
          <Text size="sm" c="dimmed">
            Development only. Creates a dev-bypass session on this server.
          </Text>
        </Stack>

        {error && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            title="Error"
            color="red"
            mb="md"
          >
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            {/* Username Input */}
            <TextInput
              label="Username"
              placeholder="dev-user"
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              leftSection={<IconUser size={16} />}
              aria-label="Username"
              disabled={loading}
              required
            />

            {/* Dev role overrides (dev/testing only) */}
            {process.env.NODE_ENV === "development" && (
              <Stack gap="xs">
                <Divider />
                <Group justify="space-between" align="center">
                  <Text fw={600} size="sm">
                    Dev permissions (optional)
                  </Text>
                  <Button
                    variant="light"
                    size="xs"
                    onClick={() => setAllActions(!allActions)}
                    aria-pressed={allActions}
                    color={allActions ? "green" : "gray"}
                    disabled={loading}
                  >
                    {allActions ? "All permissions" : "Pick permissions"}
                  </Button>
                </Group>
                <Text size="xs" c="dimmed">
                  These are added to your dev-bypass session. You can also change them later in Admin Console → My
                  Permissions.
                </Text>

                <MultiSelect
                  label="Permissions"
                  placeholder="Select permissions…"
                  disabled={loading || allActions}
                  data={Array.from(new Set([...actionOptions, ...actions])).map((value) => ({
                    value,
                    label: value,
                  }))}
                  searchable
                  clearable
                  hidePickedOptions
                  creatable
                  getCreateLabel={(query) => `+ Add "${query}"`}
                  onCreate={(query) => {
                    const value = query.trim();
                    if (!value) return null;
                    setActionOptions((prev) => (prev.includes(value) ? prev : [...prev, value]));
                    return value;
                  }}
                  value={actions}
                  onChange={setActions}
                />
              </Stack>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              fullWidth
              loading={loading}
              disabled={!username.trim() || loading}
              aria-label="Login"
            >
              {loading ? <Loader size={20} /> : "Login"}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
