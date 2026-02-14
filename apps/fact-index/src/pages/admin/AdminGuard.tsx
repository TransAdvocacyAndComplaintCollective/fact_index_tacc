import React, { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthContext } from "../../context/AuthContext";
import { useRBACContext } from "@impelsysinc/react-rbac";
import { Alert, Button, Stack, Text } from "@mantine/core";

interface AdminGuardProps {
  children: ReactNode;
}

export default function AdminGuard({ children }: AdminGuardProps) {
  const location = useLocation();
  const { loading, authenticated, isAdmin, user } = useAuthContext();
  const { canAccess } = useRBACContext();

  // User must have admin role or permission to read admin config
  const hasAdminAccess = isAdmin || canAccess('admin:config:read');

  if (loading) {
    return <div>Loading admin access…</div>;
  }

  if (!authenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!hasAdminAccess) {
    return (
      <Stack gap="md" align="center" style={{ maxWidth: 600, margin: "0 auto" }}>
        <Alert title="Admin access denied" color="red">
          <Text>You do not have permission to access the admin console.</Text>
          {user?.id && <Text size="sm" c="dimmed">User ID: {user.id}</Text>}
        </Alert>
        <Button component="a" href="/" variant="subtle">
          Back to database
        </Button>
      </Stack>
    );
  }

  return <>{children}</>;
}
