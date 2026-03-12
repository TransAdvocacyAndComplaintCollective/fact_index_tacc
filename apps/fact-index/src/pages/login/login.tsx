import React, { useState } from "react";
import { Container, Paper, Title, Alert, Button, Stack, Group, Text, Collapse, List, Modal, Box } from "@mantine/core";
import { IconAlertCircle, IconBrandDiscord, IconTerminal } from "@tabler/icons-react";
import { useAuthContext } from "../../context/AuthContext";
import LocalIdentityLogin from "./LocalIdentityLogin";

/**
 * Login Page
 *
 * Select an authentication provider (Discord or Dev) and continue via the server.
 */
function getProviderIcon(provider: any) {
  const name = provider?.displayName || provider?.name;
  if (!name) return null;
  const lower = name.toLowerCase();
  if (lower.includes("discord")) return <IconBrandDiscord size={24} aria-hidden="true" />;
  if (provider?.name === "dev") return <IconTerminal size={24} aria-hidden="true" />;
  return null;
}

function formatProviderLabel(provider: any) {
  const name = provider?.displayName || provider?.name;
  if (!name) {
    return "provider";
  }
  return name
    .split(/[\s_-]+/)
    .map((segment: string) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

export default function Login() {
  const [showLocalIdentityModal, setShowLocalIdentityModal] = useState(false);
  const {
    authenticated,
    authAvailable,
    providerOptions,
    errorReason,
    reasonCode,
    userMessage,
    showHelp,
    helpToggle,
  } = useAuthContext();

  /**
   * Handle provider selection for login
   *
   * Provider-specific handling:
   * - Dev: Show modal for local identity entry
   * - Discord: Redirect to the server
   */
  const handleProviderLogin = (provider: any) => {
    const isDev = provider.name === "dev";
    
    // DEV LOGIN: Show modal for local identity entry (no redirect)
    if (isDev) {
      setShowLocalIdentityModal(true);
      return;
    }
    
    // DISCORD LOGIN: Direct redirect to Passport Discord OAuth
    // The backend will handle the code exchange and token generation
    if (provider.url) {
      window.location.href = String(provider.url);
    }
  };

  return (
    <Container size="xs" pt="xl" role="main" aria-labelledby="login-title">
      <Paper withBorder shadow="sm" p="md" radius="md">
        {!authenticated && (
          <Box mb="md">
            <Group justify="space-between" align="center" mb="xs">
              <Title order={3} id="login-title">
                Login required
              </Title>
            </Group>
            <Text size="sm" c="dimmed">
              You are logging into: <Text span fw={600} c="blue">{window.location.hostname}</Text>
            </Text>
          </Box>
        )}

        {authenticated && (
          <Title order={3} mb="md" id="login-title">
            Login required
          </Title>
        )}

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
                variant="default"
                onClick={helpToggle}
                mb="sm"
                size="md"
                fullWidth
                aria-expanded={showHelp}
                aria-controls="login-help"
              >
                How to get access or contact an admin
              </Button>
            )}

            <Collapse in={showHelp} id="login-help" role="region" aria-label="Login help">
              <Paper withBorder p="sm" radius="sm" mb="md">
                <Text mb="xs">
                  If you see a message about access denied or authorization issues:
                </Text>
                <List withPadding type="ordered">
                  <List.Item>
                    <Text span fw={500}>Discord Login:</Text> Ensure you're in the correct Discord server 
                    and have the required role assigned.
                  </List.Item>
                  <List.Item>
                    If you're unsure which method to use, try Discord login first.
                  </List.Item>
                </List>
                <Text mt="sm">
                  If you continue to have issues, contact the project administrator with this error message:
                  <Text span fw={600}> {decodeURIComponent(userMessage || errorReason || '')}</Text>
                </Text>
                {(reasonCode || errorReason) && (
                  <Text mt="sm" size="xs" c="gray.6">
                    Error details{reasonCode ? ` (code: ${decodeURIComponent(reasonCode)})` : ""}:{" "}
                    {decodeURIComponent(errorReason || userMessage || "")}
                  </Text>
                )}
                <Group mt="sm">
                  <Button
                    variant="default"
                    onClick={() => (window.location.href = '/')}
                    aria-label="Back to home"
                  >
                    Back to home
                  </Button>
                </Group>
              </Paper>
            </Collapse>

            <Text size="sm" c="dimmed" mb="md" fw={500}>
              Select your authentication provider:
            </Text>

            <Stack>
              {providerOptions.map((provider, index) => {
                const isDev = provider.name === "dev";
                
                return (
                  <Button
                    key={provider.url ?? provider.name ?? index}
                    leftSection={getProviderIcon(provider)}
                    onClick={() => handleProviderLogin(provider)}
                    aria-label={`Login with ${formatProviderLabel(provider)}`}
                    variant="light"
                    color={
                      isDev ? "gray" : "violet"
                    }
                    size="md"
                  >
                    {`Login with ${formatProviderLabel(provider)}`}
                  </Button>
                );
              })}
            </Stack>
          </>
        )}
      </Paper>

      {/* Local Dev Login Modal */}
      <Modal
        opened={showLocalIdentityModal}
        onClose={() => setShowLocalIdentityModal(false)}
        title="Local Identity Login"
        size="sm"
        centered
      >
        <LocalIdentityLogin
          onBack={() => setShowLocalIdentityModal(false)}
        />
      </Modal>
    </Container>
  );
}
