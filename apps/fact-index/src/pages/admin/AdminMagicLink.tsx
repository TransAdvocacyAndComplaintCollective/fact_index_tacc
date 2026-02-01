import React, { useState, useCallback } from "react";
import {
  Anchor,
  Button,
  Code,
  CopyButton,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { FaMagic } from "react-icons/fa";
import { getAuthToken } from "../../context/useAuth";

interface MagicLinkResult {
  email: string;
  token: string;
  link: string;
}

export default function AdminMagicLink() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MagicLinkResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const token = getAuthToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const body: Record<string, string> = {};
      if (username.trim()) {
        body.username = username.trim();
      }

      const response = await fetch("/auth/admin/magiclink", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.message || payload?.error || "Failed to issue magic link.");
        return;
      }

      setResult({
        email: payload?.username ?? "user",
        token: payload?.token ?? "",
        link: payload?.link ?? "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error while issuing magic link.");
    } finally {
      setLoading(false);
    }
  }, [username]);

  return (
    <Paper radius="md" withBorder p="xl">
      <Stack gap="lg">
        <Group align="center" gap="sm">
          <FaMagic size={24} aria-hidden="true" />
          <div>
            <Title order={2}>Admin magic link</Title>
            <Text size="sm" c="dimmed">
              Generate a one-time magic link. Optionally specify a username for the user account.
            </Text>
          </div>
        </Group>

        <form onSubmit={(e) => { e.preventDefault(); handleGenerate(); }}>
          <Stack gap="md">
            <TextInput
              label="Username (optional)"
              placeholder="john_doe"
              value={username}
              onChange={(event) => setUsername(event.currentTarget.value)}
              disabled={loading}
            />
            <Button type="submit" loading={loading} disabled={loading} size="md">
              Generate Magic Link
            </Button>
            {error && (
              <Text size="sm" c="red" role="alert" aria-live="assertive">
                {error}
              </Text>
            )}
            {result && (
              <Stack gap="xs" aria-live="polite">
                <Text size="sm" c="green">
                  ✓ Magic link generated for: <Text component="span" fw={500}>{result.email}</Text>
                </Text>
                <Stack gap="xs">
                  <Group gap="xs" align="flex-start" wrap="nowrap">
                    <div style={{ flex: 1 }}>
                      <Text fw={500} mb="xs">
                        Magic Link URL:
                      </Text>
                      <Code block style={{ wordBreak: "break-all", fontSize: "12px" }}>
                        {result.link}
                      </Code>
                    </div>
                    <CopyButton value={result.link}>
                      {({ copied, copy }) => (
                        <Button
                          variant="filled"
                          size="sm"
                          onClick={copy}
                          color={copied ? "green" : "blue"}
                          mt="26px"
                        >
                          {copied ? "✓ Copied" : "Copy URL"}
                        </Button>
                      )}
                    </CopyButton>
                  </Group>
                  <Button
                    component="a"
                    href={result.link}
                    target="_blank"
                    rel="noreferrer"
                    variant="light"
                    fullWidth
                  >
                    Open Link in New Tab
                  </Button>
                </Stack>
                <Stack gap="xs">
                  <Group gap="xs" align="flex-start" wrap="nowrap">
                    <div style={{ flex: 1 }}>
                      <Text fw={500} mb="xs">
                        Token (for manual use):
                      </Text>
                      <Code block style={{ wordBreak: "break-all", fontSize: "12px" }}>
                        {result.token}
                      </Code>
                    </div>
                    <CopyButton value={result.token}>
                      {({ copied, copy }) => (
                        <Button
                          variant="filled"
                          size="sm"
                          onClick={copy}
                          color={copied ? "green" : "blue"}
                          mt="26px"
                        >
                          {copied ? "✓ Copied" : "Copy Token"}
                        </Button>
                      )}
                    </CopyButton>
                  </Group>
                </Stack>
              </Stack>
            )}
          </Stack>
        </form>
      </Stack>
    </Paper>
  );
}
