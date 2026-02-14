import React, { useEffect, useMemo, useState } from "react";
import { Button, Container, Loader, Stack, Text, Alert } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useNavigate, useSearchParams } from "react-router-dom";

function normalizeApiBase(apiBase: string): string {
  return (apiBase || "").replace(/\/+$/, "");
}

function buildAuthorizationUrl(searchParams: URLSearchParams): string {
  const clientId = searchParams.get("client_id") || (import.meta as any).env.VITE_OIDC_CLIENT_ID || "fact-index-frontend";
  const responseType = searchParams.get("response_type") || "code";
  const scope = searchParams.get("scope") || "openid email profile";
  const redirectUri =
    searchParams.get("redirect_uri") ||
    (import.meta as any).env.VITE_OIDC_REDIRECT_URI ||
    `${window.location.origin}/oidc/callback`;
  const apiBase = normalizeApiBase((import.meta as any).env.VITE_API_BASE_URL || "");

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: responseType,
    scope,
    redirect_uri: redirectUri,
  });

  const passthroughKeys = [
    "state",
    "nonce",
    "prompt",
    "resource",
    "audience",
    "claims",
    "login_hint",
    "acr_values",
    "ui_locales",
    "authorization_details",
  ];

  for (const key of passthroughKeys) {
    const values = searchParams.getAll(key).map((value) => value.trim()).filter(Boolean);
    if (!values.length) continue;
    params.delete(key);
    for (const value of values) {
      params.append(key, value);
    }
  }

  return `${apiBase}/oidc/authorization?${params.toString()}`;
}

export default function OidcAuthorization() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const authorizationUrl = useMemo(() => {
    try {
      return buildAuthorizationUrl(searchParams);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create authorization request");
      return "";
    }
  }, [searchParams]);

  useEffect(() => {
    if (!authorizationUrl) return;
    window.location.replace(authorizationUrl);
  }, [authorizationUrl]);

  return (
    <Container size="xs" pt="xl">
      <Stack align="center" gap="lg">
        {!error ? (
          <>
            <Loader size="lg" />
            <Text>Starting OIDC authorization...</Text>
          </>
        ) : (
          <>
            <Alert icon={<IconAlertCircle size={16} />} title="Authorization Error" color="red" style={{ width: "100%" }}>
              {error}
            </Alert>
            <Button onClick={() => navigate("/login", { replace: true })}>Return to Login</Button>
          </>
        )}
      </Stack>
    </Container>
  );
}
