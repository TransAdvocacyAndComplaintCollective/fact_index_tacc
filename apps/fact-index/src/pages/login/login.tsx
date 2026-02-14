import React, { useState } from "react";
import { Container, Paper, Title, Alert, Button, Stack, Group, Text, Collapse, List, Modal } from "@mantine/core";
import { IconAlertCircle, IconBrandDiscord, IconTerminal, IconShield } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../../context/AuthContext";
import LocalIdentityLogin from "./LocalIdentityLogin";

const FEDERATION_LOGIN_LABEL = "Login with United Fedratiob of Trans Organizaions";

function getProviderIcon(provider: any) {
  const name = provider?.displayName || provider?.name;
  if (!name) return null;
  const lower = name.toLowerCase();
  if (lower.includes("discord")) return <IconBrandDiscord size={24} aria-hidden="true" />;
  if (lower.includes("federation") || lower.includes("united") || lower.includes("tacc")) return <IconShield size={24} aria-hidden="true" />;
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
  const navigate = useNavigate();
  const [showLocalIdentityModal, setShowLocalIdentityModal] = useState(false);
  const {
    authAvailable,
    providerOptions,
    errorReason,
    reasonCode,
    userMessage,
    showHelp,
    helpToggle,
  } = useAuthContext();

  const handleProviderLogin = (provider: any) => {
    const isFederation = provider.name === "federation" || provider.type === "federation";
    const isDev = provider.name === "dev";
    
    // For dev login, show the local identity provider modal instead of direct redirect
    if (isDev) {
      setShowLocalIdentityModal(true);
      return;
    }
    
    // For federation, offer option to use dedicated federation login page or direct login
    if (isFederation) {
      // Check for a query param to control behavior
      const params = new URLSearchParams(window.location.search);
      const useDedicatedPage = params.get('federation_page') !== 'false';
      
      if (useDedicatedPage) {
        // Navigate to the dedicated federation login page
        const entityId = provider?.entityId ? String(provider.entityId) : "";
        if (entityId) {
          navigate(`/login/federation?provider=${encodeURIComponent(entityId)}`);
        } else {
          navigate('/login/federation');
        }
        return;
      }
    }

    // Direct login for all other providers and federation if disabled
    if (provider.url) {
      window.location.href = provider.url;
    }
  };

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
                    <Text span fw={500}>Federation Login:</Text> Contact a United Federation administrator 
                    to verify your account is authorized for this federation.
                  </List.Item>
                  <List.Item>
                    <Text span fw={500}>Discord Login:</Text> Ensure you're in the correct Discord server 
                    and have the required role assigned.
                  </List.Item>
                  <List.Item>
                    If you're unsure which method to use, try the Federation login first as it provides 
                    broader access across multiple services.
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

            <Stack>
              {providerOptions.map((provider, index) => {
                const isDev = provider.name === "dev";
                const isFederation = provider.name === "federation" || provider.type === "federation";
                
                return (
                  <Button
                    key={provider.url ?? provider.entityId ?? provider.name ?? index}
                    leftSection={getProviderIcon(provider)}
                    onClick={() => handleProviderLogin(provider)}
                    aria-label={isFederation ? FEDERATION_LOGIN_LABEL : `Login with ${formatProviderLabel(provider)}`}
                    variant="light"
                    color={
                      isDev ? "gray" : 
                      isFederation ? "blue" : 
                      "violet"
                    }
                    size="md"
                  >
                    {isFederation ? FEDERATION_LOGIN_LABEL : `Login with ${formatProviderLabel(provider)}`}
                  </Button>
                );
              })}
            </Stack>
          </>
        )}
      </Paper>

      {/* Local Identity Provider Modal */}
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
