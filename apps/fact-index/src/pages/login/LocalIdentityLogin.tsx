/**
 * Local Identity Provider Login
 * Allows users to select an identity provider and enter a username for local/dev authentication
 */

import React, { useState } from "react";
import {
  Container,
  Paper,
  Title,
  Stack,
  Select,
  TextInput,
  Button,
  Group,
  Alert,
  Text,
  Badge,
  Loader,
  Center,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconArrowLeft,
  IconBuilding,
  IconUser,
} from "@tabler/icons-react";

interface IdentityProvider {
  value: string;
  label: string;
  domain?: string;
  description?: string;
}

interface LocalIdentityLoginProps {
  onBack?: () => void;
}

// Available identity providers
const IDENTITY_PROVIDERS: IdentityProvider[] = [
  {
    value: "tacc",
    label: "TACC (Texas Advanced Computing Center)",
    domain: "tacc.utexas.edu",
    description: "University of Texas at Austin - Advanced Computing",
  },
  {
    value: "local",
    label: "Local Development",
    domain: "localhost",
    description: "Local testing and development",
  },
];

export default function LocalIdentityLogin({ onBack }: LocalIdentityLoginProps) {
  const [selectedProvider, setSelectedProvider] = useState<string | null>("tacc");
  const [username, setUsername] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentProvider = IDENTITY_PROVIDERS.find(
    (p) => p.value === selectedProvider
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProvider) {
      setError("Please select an identity provider");
      return;
    }

    if (!username.trim()) {
      setError("Please enter a username");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Redirect to the dev login endpoint with provider and username
      const params = new URLSearchParams({
        provider: selectedProvider,
        user: username.trim(),
        ...(isAdmin && { admin: "true" }),
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
        <Group justify="space-between" mb="md">
          {onBack && (
            <Button
              variant="default"
              leftSection={<IconArrowLeft size={16} />}
              onClick={onBack}
              aria-label="Back to login"
              p={0}
            >
              Back
            </Button>
          )}
          <Title order={3} id="identity-login-title" style={{ flex: 1 }}>
            Local Identity Login
          </Title>
        </Group>

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
            {/* Provider Selection */}
            <div>
              <Select
                label="Identity Provider"
                placeholder="Select an identity provider"
                data={IDENTITY_PROVIDERS.map((p) => ({
                  value: p.value,
                  label: p.label,
                }))}
                value={selectedProvider}
                onChange={setSelectedProvider}
                leftSection={<IconBuilding size={16} />}
                aria-label="Identity Provider"
                searchable
                clearable={false}
                required
              />

              {/* Provider Details */}
              {currentProvider && (
                <Paper bg="blue.0" p="sm" radius="sm" mt="sm">
                  <Group justify="space-between" mb="xs">
                    <Badge color="blue" autoContrast>
                      {currentProvider.domain}
                    </Badge>
                  </Group>
                  <Text size="sm" c="dark">
                    {currentProvider.description}
                  </Text>
                </Paper>
              )}
            </div>

            {/* Username Input */}
            <TextInput
              label="Username"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              leftSection={<IconUser size={16} />}
              aria-label="Username"
              disabled={loading}
              required
            />

            {/* Admin Toggle (dev/testing only) */}
            {process.env.NODE_ENV === "development" && (
              <div>
                <Group gap="xs" mb="xs">
                  <Button
                    variant="light"
                    size="xs"
                    onClick={() => setIsAdmin(!isAdmin)}
                    aria-pressed={isAdmin}
                    color={isAdmin ? "green" : "gray"}
                  >
                    {isAdmin ? "Admin Mode ON" : "Admin Mode OFF"}
                  </Button>
                  <Text size="xs" c="dark">
                    Dev testing - admin access
                  </Text>
                </Group>
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              fullWidth
              loading={loading}
              disabled={!selectedProvider || !username.trim() || loading}
              aria-label={`Login with ${currentProvider?.label || "selected provider"}`}
            >
              {loading ? <Loader size={20} /> : "Login"}
            </Button>

            {/* Info Section */}
            <Paper bg="gray.0" p="sm" radius="sm">
              <Text size="sm" c="dark" mb="xs">
                <strong>Available Providers:</strong>
              </Text>
              <Stack gap="xs">
                {IDENTITY_PROVIDERS.map((provider) => (
                  <div key={provider.value}>
                    <Text size="xs" fw={500} c="dark">
                      {provider.label}
                    </Text>
                    <Text size="xs" c="dark">
                      Domain: {provider.domain}
                    </Text>
                  </div>
                ))}
              </Stack>
            </Paper>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
