/**
 * Federation Login Page
 * Dedicated UI for OpenID Federation authentication flow
 * Displays federation provider information and handles the authorization process
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Container,
  Paper,
  Title,
  Text,
  Button,
  Stack,
  Group,
  Alert,
  Loader,
  ThemeIcon,
  SegmentedControl,
  Select,
  TextInput,
  Checkbox,
} from '@mantine/core';
import {
  IconShield,
  IconAlertCircle,
  IconArrowRight,
} from '@tabler/icons-react';

interface FederationProvider {
  name: string;
  displayName?: string;
  entityId: string;
  available: boolean;
  url: string;
  type?: string;
}

function normalizeApiBase(apiBase: string) {
  return (apiBase || '').replace(/\/+$/, '');
}

function looksLikeFederationProvider(p: any): boolean {
  const t = String(p?.type || '').toLowerCase();
  const n = String(p?.name || '').toLowerCase();
  return t === 'federation' || n === 'federation' || t === 'openid-federation' || t === 'oidf';
}

function getProviderHost(entityId: string): string | null {
  try {
    return new URL(entityId).host.toLowerCase();
  } catch {
    return null;
  }
}

function appendAuthorizationDetails(baseTargetUrl: string, authorizationDetailsRaw: string | null): string {
  if (!authorizationDetailsRaw) return baseTargetUrl;

  // Ensure the incoming value is valid JSON before forwarding.
  try {
    const parsed = JSON.parse(authorizationDetailsRaw);
    if (!Array.isArray(parsed)) return baseTargetUrl;
  } catch {
    return baseTargetUrl;
  }

  const url = new URL(baseTargetUrl, window.location.origin);
  url.searchParams.set('authorization_details', authorizationDetailsRaw);

  if (baseTargetUrl.startsWith('http://') || baseTargetUrl.startsWith('https://')) {
    return url.toString();
  }
  return `${url.pathname}${url.search}`;
}

const FORWARDED_AUTH_QUERY_KEYS = [
  'authorization_details',
  'resource',
  'audience',
  'prompt',
  'login_hint',
  'acr_values',
  'ui_locales',
  'claims',
  'nonce',
] as const;

function appendForwardedAuthorizationParams(baseTargetUrl: string, searchParams: URLSearchParams): string {
  const url = new URL(baseTargetUrl, window.location.origin);

  for (const key of FORWARDED_AUTH_QUERY_KEYS) {
    const values = searchParams.getAll(key).map((value) => value.trim()).filter(Boolean);
    if (!values.length) continue;
    url.searchParams.delete(key);
    for (const value of values) {
      url.searchParams.append(key, value);
    }
  }

  if (baseTargetUrl.startsWith('http://') || baseTargetUrl.startsWith('https://')) {
    return url.toString();
  }
  return `${url.pathname}${url.search}`;
}

export default function FederationLogin() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [providers, setProviders] = useState<FederationProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'idp' | 'domain'>('idp');
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [domainInput, setDomainInput] = useState<string>('');
  const [allowSubdomains, setAllowSubdomains] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [initiating, setInitiating] = useState(false);

  const normalizeCustomEntityId = useCallback((value: string): string | null => {
    const raw = (value || '').trim();
    if (!raw) return null;
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const parsed = new URL(withScheme);
      const normalized = `${parsed.protocol}//${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
      return normalized.replace(/\/+$/, '');
    } catch {
      return null;
    }
  }, []);

  const selectedProvider = useMemo(() => {
    return providers.find((p) => p.entityId === selectedEntityId) || null;
  }, [providers, selectedEntityId]);

  const normalizedDomainEntityId = useMemo(() => {
    return normalizeCustomEntityId(domainInput);
  }, [domainInput, normalizeCustomEntityId]);

  const domainValidationError = useMemo(() => {
    if (!domainInput.trim()) return null;
    return normalizedDomainEntityId ? null : 'Enter a valid domain or entity ID.';
  }, [domainInput, normalizedDomainEntityId]);

  const mappedTrustedProvider = useMemo(() => {
    if (!normalizedDomainEntityId) return null;
    const inputHost = getProviderHost(normalizedDomainEntityId);
    if (!inputHost) return null;

    for (const provider of providers) {
      const providerHost = getProviderHost(provider.entityId);
      if (!providerHost) continue;
      if (inputHost === providerHost) return provider;
      if (allowSubdomains && inputHost.endsWith(`.${providerHost}`)) return provider;
    }

    return null;
  }, [allowSubdomains, normalizedDomainEntityId, providers]);

  // Fetch available federation providers on mount (and when query params change)
  useEffect(() => {
    const controller = new AbortController();

    const fetchProviders = async () => {
      try {
        setLoading(true);
        setError(null);

        const apiBase = normalizeApiBase((import.meta as any).env.VITE_API_BASE_URL || '');
        const response = await fetch(`${apiBase}/auth/available`, {
          credentials: 'include',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Failed to fetch authentication providers');
        }

        const data = await response.json();

        const federationProviders: FederationProvider[] = (data?.providers || [])
          .filter(looksLikeFederationProvider)
          .map((p: any) => ({
            name: String(p?.name || 'federation'),
            displayName: p?.displayName ? String(p.displayName) : undefined,
            entityId: String(p?.entityId || ''),
            available: Boolean(p?.available ?? true),
            url: String(p?.url || ''),
            type: p?.type ? String(p.type) : undefined,
          }))
          .filter((p: FederationProvider) => p.entityId); // entityId is required for selection

        if (federationProviders.length === 0) {
          setProviders([]);
          setSelectedEntityId('');
          setDomainInput('');
          setError('No federation providers available');
          return;
        }

        // Nice stable ordering
        federationProviders.sort((a, b) =>
          (a.displayName || a.name).localeCompare(b.displayName || b.name)
        );

        setProviders(federationProviders);

        // Optional preselect from URL: ?provider=<entityId> (also supports entityId / idp)
        const preferred =
          searchParams.get('provider') ||
          searchParams.get('entityId') ||
          searchParams.get('idp') ||
          '';

        const preferredMatch = preferred
          ? federationProviders.find((p) => p.entityId === preferred || p.name === preferred)
          : null;

        const firstAvailable = federationProviders.find((p) => p.available) || federationProviders[0];

        if (preferredMatch) {
          setMode('idp');
          setSelectedEntityId(preferredMatch.entityId);
          return;
        }

        const normalizedPreferred = preferred ? normalizeCustomEntityId(preferred) : null;
        if (normalizedPreferred) {
          setMode('domain');
          setDomainInput(normalizedPreferred);
        }

        setSelectedEntityId(firstAvailable.entityId);
      } catch (err) {
        if ((err as any)?.name === 'AbortError') return;

        const message =
          err instanceof Error ? err.message : 'Failed to load federation providers';
        console.error('[FederationLogin]', message);
        setProviders([]);
        setSelectedEntityId('');
        setDomainInput('');
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchProviders();

    return () => {
      controller.abort();
    };
  }, [searchParams]);

  useEffect(() => {
    if (error) setError(null);
  }, [mode, selectedEntityId, domainInput, error]);

  const handleInitiateLogin = useCallback(() => {
    let targetUrl = '';
    const authorizationDetailsRaw =
      searchParams.get('authorization_details') ||
      searchParams.get('authorizationDetails') ||
      searchParams.get('rar');

    if (mode === 'idp') {
      if (!selectedProvider) {
        setError('Please choose a federation provider.');
        return;
      }

      if (!selectedProvider.available) {
        setError('Selected provider is unavailable. Please choose another provider.');
        return;
      }

      targetUrl = selectedProvider.url;
    } else {
      const domainEntityId = normalizeCustomEntityId(domainInput);
      if (!domainEntityId) {
        setError('Please enter a valid federation provider domain or entity ID.');
        return;
      }

      const matchingProvider = mappedTrustedProvider;
      if (!matchingProvider) {
        setError('Domain is not mapped to a trusted federation provider.');
        return;
      }
      if (matchingProvider && !matchingProvider.available) {
        setError('Selected provider is unavailable. Please choose another provider.');
        return;
      }

      targetUrl = matchingProvider.url || `/auth/federation/login?op=${encodeURIComponent(matchingProvider.entityId)}`;
      setDomainInput(domainEntityId);
    }

    if (!targetUrl) {
      setError('Selected provider is missing a login URL.');
      return;
    }

    targetUrl = appendAuthorizationDetails(targetUrl, authorizationDetailsRaw);
    targetUrl = appendForwardedAuthorizationParams(targetUrl, searchParams);

    setInitiating(true);
    setError(null);

    // Redirect to the federation login endpoint
    window.location.assign(targetUrl);
  }, [domainInput, mappedTrustedProvider, mode, normalizeCustomEntityId, searchParams, selectedProvider]);

  const handleCancel = useCallback(() => {
    navigate('/login', { replace: true });
  }, [navigate]);

  if (loading) {
    return (
      <Container size="sm" pt="xl" role="main" aria-labelledby="federation-login-title">
        <Paper withBorder shadow="sm" p="xl" radius="md">
          <Stack align="center" gap="lg">
            <Loader size="lg" />
            <Title order={2} id="federation-login-title">
              Loading federation options...
            </Title>
            <Text c="dimmed">Please wait while we prepare the federation login.</Text>
          </Stack>
        </Paper>
      </Container>
    );
  }

  const disableContinue =
    initiating ||
    (mode === 'idp'
      ? !selectedProvider || !selectedProvider.available
      : !domainInput.trim() || Boolean(domainValidationError));

  return (
    <Container size="sm" pt="xl" role="main" aria-labelledby="federation-login-title">
      <Stack gap="lg">
        {/* Header Section */}
        <Paper
          withBorder
          shadow="sm"
          p="lg"
          radius="md"
          bg="light-dark(var(--mantine-color-blue-1), var(--mantine-color-dark-7))"
        >
          <Group gap="md" mb="md">
            <ThemeIcon size="lg" radius="md" variant="light" color="blue">
              <IconShield size={24} />
            </ThemeIcon>
            <div>
              <Title order={2} id="federation-login-title">
                Login with United Fedratiob of Trans Organizaions
              </Title>
              <Text size="sm" c="dimmed">
                Secure authentication through OpenID Federation
              </Text>
            </div>
          </Group>
        </Paper>

        {/* Error Alert */}
        {error && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            title="Authentication Error"
            color="red"
            variant="light"
            withCloseButton
            onClose={() => setError(null)}
            role="alert"
          >
            {error}
          </Alert>
        )}

        {/* Provider Selection */}
        {providers.length > 0 && (
          <Paper withBorder shadow="sm" p="lg" radius="md">
            <Stack gap="md">
              <div>
                <Title order={3} mb="xs">
                  Pick an OpenID Connect (OIDC) federated IdP
                </Title>
                <Text size="sm" c="dimmed">
                  Choose from trusted organizations only.
                </Text>
              </div>

              <SegmentedControl
                value={mode}
                onChange={(value) => setMode(value as 'idp' | 'domain')}
                fullWidth
                data={[
                  { label: 'Choose IdP', value: 'idp' },
                  { label: 'Enter Domain', value: 'domain' },
                ]}
                aria-label="Federation provider mode"
              />

              {mode === 'idp' ? (
                <Select
                  label="Trusted federated IdP"
                  placeholder="Search and select provider"
                  value={selectedEntityId}
                  onChange={(value) => {
                    const next = value || '';
                    if (!next) {
                      setSelectedEntityId('');
                      return;
                    }
                    const isTrusted = providers.some((provider) => provider.entityId === next);
                    if (isTrusted) {
                      setSelectedEntityId(next);
                    } else {
                      setSelectedEntityId('');
                      setError('Selected IdP is not in the trusted provider list.');
                    }
                  }}
                  data={providers.map((provider) => ({
                    value: provider.entityId,
                    label: provider.displayName || provider.name,
                    disabled: !provider.available,
                  }))}
                  searchable
                  nothingFoundMessage="No providers found"
                  aria-label="Federation IdP choice"
                />
              ) : (
                <Stack gap="xs">
                  <TextInput
                    label="Organization domain"
                    placeholder="org.example.org or https://org.example.org"
                    value={domainInput}
                    onChange={(event) => setDomainInput(event.currentTarget.value)}
                    onBlur={() => {
                      const normalized = normalizeCustomEntityId(domainInput);
                      if (normalized) setDomainInput(normalized);
                    }}
                    description="Domain is validated and mapped to a trusted organization."
                    error={
                      domainValidationError ||
                      (domainInput.trim() && normalizedDomainEntityId && !mappedTrustedProvider
                        ? 'No trusted organization matches this domain.'
                        : null)
                    }
                    aria-label="Organization domain"
                  />
                  <Checkbox
                    checked={allowSubdomains}
                    onChange={(event) => setAllowSubdomains(event.currentTarget.checked)}
                    label="Allow subdomains"
                  />
                  {mappedTrustedProvider && (
                    <Text size="sm" c="dimmed">
                      Mapped to trusted org: {mappedTrustedProvider.displayName || mappedTrustedProvider.name}
                    </Text>
                  )}
                </Stack>
              )}

              {mode === 'idp' && selectedProvider && (
                <Alert
                  color={selectedProvider.available ? 'blue' : 'red'}
                  variant="light"
                  title="Selected provider"
                >
                  <Text size="sm">
                    {selectedProvider.displayName || selectedProvider.name}
                  </Text>
                  <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>
                    {selectedProvider.entityId}
                  </Text>
                </Alert>
              )}
            </Stack>
          </Paper>
        )}

 

        {/* Action Buttons */}
        <Paper withBorder shadow="sm" p="lg" radius="md">
          <Stack gap="md">
            <Button
              size="md"
              fullWidth
              onClick={handleInitiateLogin}
              loading={initiating}
              disabled={disableContinue}
              leftSection={<IconArrowRight size={18} />}
              aria-label="Initiate federation login"
            >
              {initiating ? 'Initiating login...' : 'Login with United Fedratiob of Trans Organizaions'}
            </Button>

            <Group justify="center">
              <Text size="sm">or</Text>
            </Group>

            <Button
              size="md"
              fullWidth
              variant="default"
              onClick={handleCancel}
              disabled={initiating}
              aria-label="Cancel and return to login"
            >
              Back to Login Options
            </Button>
          </Stack>
        </Paper>


      </Stack>
    </Container>
  );
}
