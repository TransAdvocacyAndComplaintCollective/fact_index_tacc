import React, { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthContext } from "../../context/AuthContext";
import { useRBACContext } from "@impelsysinc/react-rbac";
import { Alert, Button, Stack, Title, Text } from "@mantine/core";

interface AdminGuardProps {
  children: ReactNode;
}

export default function AdminGuard({ children }: AdminGuardProps) {
  const location = useLocation();
  const { loading, authenticated, isAdmin } = useAuthContext();
  const { canAccess } = useRBACContext();

  const hasPermission =
    Boolean(isAdmin) || canAccess({ resource: "admin.magiclink", action: "create" });

  if (loading) {
    return <div>Loading admin access…</div>;
  }

  if (!authenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!hasPermission) {
    return (
      <Stack spacing="md" align="center" sx={{ maxWidth: 600, margin: "0 auto" }}>
        <Alert title="Admin access required" color="orange">
          <Text>Only users with administrative privileges can view this page.</Text>
        </Alert>
        <Button component="a" href="/" variant="subtle">
          Back to database
        </Button>
      </Stack>
    );
  }

  return <>{children}</>;
}
