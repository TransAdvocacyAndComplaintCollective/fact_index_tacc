import React, { useEffect, useMemo, useState } from "react";
import { useForm } from "@mantine/form";
import { Alert, Button, MultiSelect, Stack, Tabs, Text, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthContext } from "../../context/AuthContext";
import { useRBACContext } from "@impelsysinc/react-rbac";
import { safeCanAccess } from "../../utils/safeCanAccess";

import AccessManagementPanel from "./components/AccessManagementPanel";
import KnownUsersPanel from "./components/KnownUsersPanel";
import TaxonomyPanel from "./components/TaxonomyPanel";
import type { AdminConfig } from "./adminTypes";
import { ADMIN_CONFIG_QUERY_KEY, PERMISSION_OPTIONS } from "./adminConstants";
import { authJson, formatError } from "./adminApi";

export default function AdminConsole() {
  const queryClient = useQueryClient();
  const { isAdmin, user, devBypass, hasSuperuser } = useAuthContext();
  const { canAccess } = useRBACContext();
  const [activeTab, setActiveTab] = useState<string | null>("access-management");
  const [accessInnerTab, setAccessInnerTab] = useState<string | null>("roles");

  const canReadConfig = hasSuperuser || isAdmin || safeCanAccess(canAccess, "admin:read") || safeCanAccess(canAccess, "admin:write");
  const canReadGuilds = canReadConfig;
  const canReadRoles = canReadConfig;
  const canManageRoles = hasSuperuser || isAdmin || safeCanAccess(canAccess, "admin:write");
  const canManageUsers = hasSuperuser || isAdmin || safeCanAccess(canAccess, "admin:write");
  const canManageWhitelist = hasSuperuser || isAdmin || safeCanAccess(canAccess, "admin:write");
  const canReadTaxonomy = hasSuperuser || isAdmin || safeCanAccess(canAccess, "taxonomy:read") || safeCanAccess(canAccess, "taxonomy:write");

  const configQuery = useQuery<AdminConfig>({
    queryKey: ADMIN_CONFIG_QUERY_KEY,
    queryFn: () => authJson("/auth/admin/config"),
    enabled: canReadConfig,
  });

  const config = configQuery.data;
  const roles = config?.roles ?? {};
  const userPermissions = config?.userPermissions ?? {};
  const knownUsers = config?.knownUsers ?? [];
  const whitelistUsers = config?.whitelistUsers ?? [];

  const permissionOptions = useMemo(() => PERMISSION_OPTIONS, []);
  const configuredRoleIds = useMemo(() => Object.keys(roles).sort((a, b) => a.localeCompare(b)), [roles]);
  const configuredUserIds = useMemo(
    () => Object.keys(userPermissions).sort((a, b) => a.localeCompare(b)),
    [userPermissions],
  );
  const whitelistSorted = useMemo(() => [...whitelistUsers].sort((a, b) => a.localeCompare(b)), [whitelistUsers]);

  const rolePermissionsForm = useForm({
    initialValues: { roleId: "", permissions: [] as string[] },
    validate: {
      roleId: (value) => (String(value || "").trim() ? null : "Discord role ID is required."),
      permissions: (value) => (Array.isArray(value) && value.length ? null : "Select at least one permission."),
    },
  });
  const userPermissionsForm = useForm({
    initialValues: { userId: "", permissions: [] as string[] },
    validate: {
      userId: (value) => (String(value || "").trim() ? null : "Discord user ID is required."),
      permissions: (value) => (Array.isArray(value) && value.length ? null : "Select at least one permission."),
    },
  });
  const whitelistForm = useForm({ initialValues: { userId: "" } });
  const knownUserForm = useForm({ initialValues: { userId: "", username: "" } });
  const selfPermissionsForm = useForm({ initialValues: { permissions: [] as string[] } });

  useEffect(() => {
    if (!devBypass) return;
    const perms = Array.isArray(user?.permissions) ? (user.permissions as any[]).map((p) => String(p)) : [];
    selfPermissionsForm.setValues({ permissions: perms });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devBypass, user?.id]);

  const saveRolePermissionsMutation = useMutation({
    mutationFn: async (values: { roleId: string; permissions: string[] }) => {
      const roleId = values.roleId.trim();
      if (!roleId) throw new Error("Discord role ID is required.");
      await authJson("/auth/admin/roles", {
        method: "POST",
        body: JSON.stringify({ roleId, permissions: values.permissions }),
      });
    },
    onSuccess: () => {
      rolePermissionsForm.reset();
      queryClient.invalidateQueries({ queryKey: ADMIN_CONFIG_QUERY_KEY });
    },
  });

  const saveUserPermissionsMutation = useMutation({
    mutationFn: async (values: { userId: string; permissions: string[] }) => {
      const userId = values.userId.trim();
      if (!userId) throw new Error("Discord user ID is required.");
      await authJson("/auth/admin/user-permissions", {
        method: "POST",
        body: JSON.stringify({ userId, permissions: values.permissions }),
      });
    },
    onSuccess: () => {
      userPermissionsForm.reset();
      queryClient.invalidateQueries({ queryKey: ADMIN_CONFIG_QUERY_KEY });
    },
  });

  const removeUserPermissionsMutation = useMutation({
    mutationFn: async (userId: string) => {
      await authJson(`/auth/admin/user-permissions/${encodeURIComponent(userId)}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_CONFIG_QUERY_KEY });
    },
  });

  const addWhitelistMutation = useMutation({
    mutationFn: async (userId: string) => {
      await authJson("/auth/admin/whitelist", {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
    },
    onSuccess: () => {
      whitelistForm.reset();
      queryClient.invalidateQueries({ queryKey: ADMIN_CONFIG_QUERY_KEY });
    },
  });

  const removeWhitelistMutation = useMutation({
    mutationFn: async (userId: string) => {
      await authJson(`/auth/admin/whitelist/${encodeURIComponent(userId)}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_CONFIG_QUERY_KEY });
    },
  });

  const upsertKnownUserMutation = useMutation({
    mutationFn: async (values: { userId: string; username: string }) => {
      const userId = values.userId.trim();
      if (!userId) throw new Error("Discord user ID is required.");
      const username = values.username.trim();
      await authJson("/auth/admin/known-users", {
        method: "POST",
        body: JSON.stringify({ userId, username: username || null }),
      });
    },
    onSuccess: () => {
      knownUserForm.reset();
      queryClient.invalidateQueries({ queryKey: ADMIN_CONFIG_QUERY_KEY });
    },
  });

  const saveSelfPermissionsMutation = useMutation({
    mutationFn: async (values: { permissions: string[] }) => {
      await authJson("/auth/admin/self-permissions", {
        method: "POST",
        body: JSON.stringify({ permissions: values.permissions }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_CONFIG_QUERY_KEY });
    },
  });

  const handleRolePermissionsSubmit = rolePermissionsForm.onSubmit((values) => saveRolePermissionsMutation.mutate(values));
  const handleUserPermissionsSubmit = userPermissionsForm.onSubmit((values) => saveUserPermissionsMutation.mutate(values));
  const handleWhitelistSubmit = whitelistForm.onSubmit((values) => {
    const userId = values.userId.trim();
    if (!userId) return;
    addWhitelistMutation.mutate(userId);
  });

  const goToUserPermissions = (userId: string) => {
    const normalized = String(userId || "").trim();
    if (!normalized) return;
    setActiveTab("access-management");
    setAccessInnerTab("users");
    userPermissionsForm.setValues({
      userId: normalized,
      permissions: Array.isArray(userPermissions[normalized]) ? userPermissions[normalized] : [],
    });
  };

  const goToWhitelist = (userId: string) => {
    const normalized = String(userId || "").trim();
    if (!normalized) return;
    setActiveTab("access-management");
    setAccessInnerTab("whitelist");
    whitelistForm.setValues({ userId: normalized });
  };

  if (!canReadConfig) {
    return (
      <Stack gap="md">
        <Alert title="Access denied" color="red">
          <Text>You do not have permission to access the admin console.</Text>
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack gap="xl">
      <Stack gap="xs">
        <Title>Admin console</Title>
        <Text size="sm" c="dimmed">
          Configure permissions for Discord roles and individual users.
        </Text>
      </Stack>

      {configQuery.isError && (
        <Alert title="Unable to load admin configuration" color="red">
          {formatError(configQuery.error)}
        </Alert>
      )}

      <Tabs value={activeTab} onChange={setActiveTab} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="access-management" disabled={!canReadGuilds && !canReadRoles}>
            Access Management
          </Tabs.Tab>
          <Tabs.Tab value="known-users" disabled={!canReadConfig}>
            Known Users
          </Tabs.Tab>
          <Tabs.Tab value="taxonomy" disabled={!canReadTaxonomy}>
            Subjects & Audiences
          </Tabs.Tab>
          <Tabs.Tab value="my-permissions" disabled={!devBypass}>
            My Permissions
          </Tabs.Tab>
        </Tabs.List>

        <AccessManagementPanel
          roles={roles}
          userPermissions={userPermissions}
          knownUsers={knownUsers}
          whitelistUsers={whitelistSorted}
          permissionOptions={permissionOptions}
          canManageRoles={canManageRoles}
          canManageUsers={canManageUsers}
          canManageWhitelist={canManageWhitelist}
          configuredRoleIds={configuredRoleIds}
          configuredUserIds={configuredUserIds}
          accessInnerTab={accessInnerTab}
          onAccessInnerTabChange={setAccessInnerTab}
          rolePermissionsForm={rolePermissionsForm}
          userPermissionsForm={userPermissionsForm}
          whitelistForm={whitelistForm}
          handleRolePermissionsSubmit={handleRolePermissionsSubmit}
          handleUserPermissionsSubmit={handleUserPermissionsSubmit}
          handleWhitelistSubmit={handleWhitelistSubmit}
          saveRolePermissionsMutation={saveRolePermissionsMutation as any}
          saveUserPermissionsMutation={saveUserPermissionsMutation as any}
          removeUserPermissionsMutation={{ ...(removeUserPermissionsMutation as any), mutate: removeUserPermissionsMutation.mutate }}
          addWhitelistMutation={addWhitelistMutation as any}
          removeWhitelistMutation={{ ...(removeWhitelistMutation as any), mutate: removeWhitelistMutation.mutate }}
          formatError={formatError}
        />

        <Tabs.Panel value="known-users" pt="md">
          <KnownUsersPanel
            knownUsers={knownUsers}
            canManageUsers={canManageUsers}
            knownUserForm={knownUserForm}
            upsertKnownUserMutation={{ ...(upsertKnownUserMutation as any), mutate: upsertKnownUserMutation.mutate }}
            formatError={formatError}
            onGoToUserPermissions={goToUserPermissions}
            onGoToWhitelist={goToWhitelist}
          />
        </Tabs.Panel>

        <Tabs.Panel value="taxonomy" pt="md">
          <TaxonomyPanel />
        </Tabs.Panel>

        <Tabs.Panel value="my-permissions" pt="md">
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Dev-bypass only: set permissions for your own user ID.
            </Text>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveSelfPermissionsMutation.mutate({ permissions: selfPermissionsForm.values.permissions });
              }}
            >
              <Stack gap="sm">
                <MultiSelect
                  label="My permissions"
                  placeholder="Select permissions"
                  data={permissionOptions}
                  searchable
                  nothingFoundMessage="No permissions found"
                  disabled={!devBypass || saveSelfPermissionsMutation.isPending}
                  value={selfPermissionsForm.values.permissions}
                  onChange={(value) => selfPermissionsForm.setFieldValue("permissions", value)}
                />
                <Button
                  type="submit"
                  loading={saveSelfPermissionsMutation.isPending}
                  disabled={!devBypass || saveSelfPermissionsMutation.isPending}
                >
                  Save my permissions
                </Button>
              </Stack>
            </form>
            {saveSelfPermissionsMutation.isError && (
              <Alert title="Failed" color="red">
                {formatError(saveSelfPermissionsMutation.error)}
              </Alert>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
