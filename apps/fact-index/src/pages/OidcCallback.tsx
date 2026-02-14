/**
 * OIDC Callback Error Handler
 * Handles authentication errors that might be passed back from the backend
 * after federation authentication processing
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Container, Stack, Loader, Text, Alert, Button } from '@mantine/core';
import { IconAlertCircle, IconCheck } from '@tabler/icons-react';

export default function OidcCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Check if there was an error from the backend
        const errorParam = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        if (errorParam) {
          const msg = errorDescription
            ? `${decodeURIComponent(errorParam)}: ${decodeURIComponent(errorDescription)}`
            : decodeURIComponent(errorParam);
          setError(msg);
          setLoading(false);
          return;
        }

        // No error - authentication should have succeeded
        // Check authentication status and redirect
        const apiBase = import.meta.env.VITE_API_BASE_URL || '';
        const authResponse = await fetch(`${apiBase}/auth/status`, { 
          credentials: 'include' 
        });

        if (authResponse.ok) {
          const authData = await authResponse.json();
          if (authData?.discord?.authenticated || authData?.user) {
            // Successfully authenticated - redirect to home
            navigate('/', { replace: true });
            return;
          }
        }

        // Authentication check failed - redirect to login with a message
        navigate('/login?error=auth_check_failed&error_description=Authentication+status+unclear', { replace: true });
        
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error during callback';
        console.error('[OIDC Callback]', message);
        setError(message);
        setLoading(false);
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  const handleReturnToLogin = () => {
    navigate('/login', { replace: true });
  };

  const handleReturnHome = () => {
    navigate('/', { replace: true });
  };

  return (
    <Container size="xs" pt="xl">
      <Stack align="center" gap="lg">
        {loading ? (
          <>
            <Loader size="lg" />
            <Text>Completing authentication...</Text>
          </>
        ) : error ? (
          <>
            <Alert
              icon={<IconAlertCircle size={16} />}
              title="Authentication Error"
              color="red"
              style={{ width: '100%' }}
            >
              {error}
            </Alert>
            <Stack align="center" gap="md">
              <Button onClick={handleReturnToLogin} variant="filled">
                Return to Login
              </Button>
              <Button onClick={handleReturnHome} variant="subtle">
                Go to Home
              </Button>
            </Stack>
          </>
        ) : (
          <>
            <IconCheck size={48} color="green" />
            <Text>Authentication successful!</Text>
            <Text size="sm" c="gray">Redirecting...</Text>
          </>
        )}
      </Stack>
    </Container>
  );
}
