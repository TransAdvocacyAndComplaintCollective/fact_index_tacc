import React from "react";
import { Container, Paper, Title, Alert, Button, Stack, Group, Text, Collapse, List, useMantineTheme } from "@mantine/core";
import { IconAlertCircle, IconBrandDiscord, IconTerminal } from "@tabler/icons-react";
import { useAuthContext } from "../../context/AuthContext";

function getProviderIcon(name?: string) {
  if (!name) return null;
  switch (name.toLowerCase()) {
    case "discord":
      return <IconBrandDiscord size={24} aria-hidden="true" />;
    case "dev":
      return <IconTerminal size={24} aria-hidden="true" />;
    default:
      return null;
  }
}

function formatProviderLabel(name?: string) {
  if (!name) {
    return "provider";
  }
  return name
    .split(/[\s_-]+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

export default function Login() {
  const {
    authAvailable,
    providerOptions,
    errorReason,
    reasonCode,
    userMessage,
    showHelp,
    helpToggle,
  } = useAuthContext();
  const theme = useMantineTheme();

  return (
    <Container size="xs" pt="xl" role="main" aria-labelledby="login-title">
      <Paper withBorder shadow="sm" p="md" radius="md">
        <Title order={3} mb="md" id="login-title">
          Login required
        </Title>

        {!authAvailable ? (
          <Alert icon={<IconAlertCircle size={16} />} title="Login unavailable" color="red" mb="md">
            Login currently unavailable. Please try again later.
          </Alert>
        ) : (
          <>
            {(userMessage || errorReason) && (
              <Alert icon={<IconAlertCircle size={16} />} title="Authentication failed" color="orange" mb="sm" variant="light">
                {decodeURIComponent(userMessage || errorReason || '')}
              </Alert>
            )}

            {(userMessage || reasonCode) && (
              <Button
                variant="subtle"
                onClick={helpToggle}
                mb="sm"
                size="md"
                fullWidth
                aria-expanded={showHelp}
                aria-controls="login-help"
              >
                How to join the Discord server or contact an admin
              </Button>
            )}

            <Collapse in={showHelp} id="login-help" role="region" aria-label="Login help">
              <Paper withBorder p="sm" radius="sm" mb="md">
                <Text mb="xs">
                  If you see a message about not being in the required server or missing a role:
                </Text>
                <List withPadding type="ordered">
                  <List.Item>Confirm you're logged into the correct Discord account (the one you used to sign up).</List.Item>
                  <List.Item>Ask the server owner or an administrator to invite your account to the server.</List.Item>
                  <List.Item>If you're in the server but missing a role, request that an admin grant the required role.</List.Item>
                </List>
                <Text mt="sm">
                  If you don't know who to contact, reach out to the project administrator and provide the message you saw here so they can help:
                  <Text span fw={600}> {decodeURIComponent(userMessage || errorReason || '')}</Text>
                </Text>
                {(reasonCode || errorReason) && (
                  <Text mt="sm" size="xs" c="gray.6">
                    Discord said{reasonCode ? ` (code: ${decodeURIComponent(reasonCode)})` : ""}:{" "}
                    {decodeURIComponent(errorReason || userMessage || "")}
                  </Text>
                )}
                <Group mt="sm">
                  <Button
                    variant="light"
                    onClick={() => (window.location.href = '/')}
                    aria-label="Back to home"
                  >
                    Back to home
                  </Button>
                </Group>
              </Paper>
            </Collapse>

            <Stack>
              {providerOptions.map((provider, index) => {
                const isDev = provider.name?.toLowerCase() === "dev";
                return (
                  <Button
                    key={provider.url ?? provider.name ?? index}
                    leftSection={getProviderIcon(provider.name)}
                    onClick={() => provider.url && (window.location.href = provider.url)}
                    aria-label={`Login with ${formatProviderLabel(provider.name)}`}
                    variant={isDev ? "light" : "filled"}
                    color={isDev ? "gray" : undefined}
                  >
                    Login with {formatProviderLabel(provider.name)}
                  </Button>
                );
              })}
            </Stack>
          </>
        )}
      </Paper>
    </Container>
  );
}
