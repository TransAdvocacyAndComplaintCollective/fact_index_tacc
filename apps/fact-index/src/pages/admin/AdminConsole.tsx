import React, { useMemo } from "react";
import { useForm } from "@mantine/form";
import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  ScrollArea,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AdminMagicLink from "./AdminMagicLink";
import { getAuthToken } from "../../context/useAuth";

const ADMIN_CONFIG_QUERY_KEY = ["admin", "config"];

type GuildEntry = {
  name?: string | null;
  requiredRole?: string[] | null;
};

type RoleEntry = {
  name?: string | null;
  type?: string | null;
  description?: string | null;
};

type AdminConfig = {
  guilds: Record<string, GuildEntry>;
  roles: Record<string, RoleEntry>;
  userRoles: Record<string, string[]>;
  whitelistUsers: string[];
  adminUsers: string[];
};

function getHeaders(method: string, customHeaders?: HeadersInit): Record<string, string> {
  const normalized: Record<string, string> = {};
  if (customHeaders instanceof Headers) {
    customHeaders.forEach((value, key) => {
      normalized[key] = value;
    });
  } else if (customHeaders && typeof customHeaders === "object") {
    Object.assign(normalized, customHeaders as Record<string, string>);
  }

  if (!normalized["Content-Type"] && method !== "GET") {
    normalized["Content-Type"] = "application/json";
  }

  const token = getAuthToken();
  if (token) {
    normalized.Authorization = `Bearer ${token}`;
  }
  return normalized;
}

async function authJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = getHeaders(method, options.headers);
  const response = await fetch(path, {
    ...options,
    method,
    headers,
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object"
        ? (payload?.message as string | undefined) ?? (payload?.error as string | undefined)
        : undefined;
    throw new Error(message || `Request failed (${response.status})`);
  }

  return payload as T;
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

export default function AdminConsole() {
  const queryClient = useQueryClient();
  const configQuery = useQuery<AdminConfig>({
    queryKey: ADMIN_CONFIG_QUERY_KEY,
    queryFn: () => authJson("/auth/admin/config"),
  });

  const userRolesForm = useForm({
    initialValues: {
      userId: "",
      roles: "",
    },
  });

  const guildForm = useForm({
    initialValues: {
      guildId: "",
      name: "",
      requiredRole: "",
    },
  });

  const roleForm = useForm({
    initialValues: {
      roleId: "",
      name: "",
      type: "",
      description: "",
    },
  });

  const assignUserRolesMutation = useMutation({
    mutationFn: async (payload: { userId: string; roles: string[] }) => {
      await authJson("/auth/admin/user-roles", {
        method: "POST",
        body: JSON.stringify({ userId: payload.userId, roles: payload.roles }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries(ADMIN_CONFIG_QUERY_KEY),
  });

  const removeUserRolesMutation = useMutation({
    mutationFn: async (userId: string) => {
      await authJson(`/auth/admin/user-roles/${encodeURIComponent(userId)}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries(ADMIN_CONFIG_QUERY_KEY),
  });

  const upsertGuildMutation = useMutation({
    mutationFn: async (payload: { guildId: string; requiredRole: string[]; name?: string }) => {
      await authJson("/auth/admin/guilds", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => queryClient.invalidateQueries(ADMIN_CONFIG_QUERY_KEY),
  });

  const removeGuildMutation = useMutation({
    mutationFn: async (guildId: string) => {
      await authJson(`/auth/admin/guilds/${encodeURIComponent(guildId)}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => queryClient.invalidateQueries(ADMIN_CONFIG_QUERY_KEY),
  });

  const upsertRoleMutation = useMutation({
    mutationFn: async (payload: {
      roleId: string;
      name?: string;
      type?: string;
      description?: string;
    }) => {
      await authJson("/auth/admin/roles", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => queryClient.invalidateQueries(ADMIN_CONFIG_QUERY_KEY),
  });

  const removeRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      await authJson(`/auth/admin/roles/${encodeURIComponent(roleId)}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries(ADMIN_CONFIG_QUERY_KEY),
  });

  const config = configQuery.data;
  const userRoles = config?.userRoles ?? {};
  const guilds = config?.guilds ?? {};
  const roles = config?.roles ?? {};
  const adminUsers = config?.adminUsers ?? [];
  const whitelistUsers = config?.whitelistUsers ?? [];

  const userRolesRows = useMemo(
    () =>
      Object.entries(userRoles)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([userId, assigned]) => (
          <tr key={`user-role-${userId}`}>
            <td>{userId}</td>
            <td>{assigned.join(", ") || "—"}</td>
            <td>
              <Button
                size="xs"
                variant="outline"
                color="red"
                onClick={() => removeUserRolesMutation.mutate(userId)}
                loading={removeUserRolesMutation.isLoading}
              >
                Remove
              </Button>
            </td>
          </tr>
        )),
    [userRoles, removeUserRolesMutation],
  );

  const guildRows = useMemo(
    () =>
      Object.entries(guilds)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([guildId, guild]) => (
          <tr key={`guild-${guildId}`}>
            <td>{guildId}</td>
            <td>{guild?.name || "—"}</td>
            <td>
              {(guild?.requiredRole ?? [])
                .map((role) => role.trim())
                .filter(Boolean)
                .join(", ") || "None"}
            </td>
            <td>
              <Button
                size="xs"
                variant="outline"
                color="red"
                onClick={() => removeGuildMutation.mutate(guildId)}
                loading={removeGuildMutation.isLoading}
              >
                Remove
              </Button>
            </td>
          </tr>
        )),
    [guilds, removeGuildMutation],
  );

  const roleRows = useMemo(
    () =>
      Object.entries(roles)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([roleId, role]) => (
          <tr key={`role-${roleId}`}>
            <td>{roleId}</td>
            <td>{role?.name || "—"}</td>
            <td>{role?.type || "—"}</td>
            <td>{role?.description || "—"}</td>
            <td>
              <Button
                size="xs"
                variant="outline"
                color="red"
                onClick={() => removeRoleMutation.mutate(roleId)}
                loading={removeRoleMutation.isLoading}
              >
                Remove
              </Button>
            </td>
          </tr>
        )),
    [roles, removeRoleMutation],
  );

  const handleUserRoleSubmit = userRolesForm.onSubmit((values) => {
    assignUserRolesMutation.mutate({
      userId: values.userId.trim(),
      roles: values.roles
        .split(",")
        .map((role) => role.trim())
        .filter(Boolean),
    });
  });

  const handleGuildSubmit = guildForm.onSubmit((values) => {
    upsertGuildMutation.mutate({
      guildId: values.guildId.trim(),
      name: values.name.trim() || undefined,
      requiredRole: values.requiredRole
        .split(",")
        .map((role) => role.trim())
        .filter(Boolean),
    });
  });

  const handleRoleSubmit = roleForm.onSubmit((values) => {
    upsertRoleMutation.mutate({
      roleId: values.roleId.trim(),
      name: values.name.trim(),
      type: values.type.trim(),
      description: values.description.trim(),
    });
  });

  return (
    <Stack spacing="xl">
      <Stack spacing="xs">
        <Title>Admin console</Title>
        <Text size="sm" color="dimmed">
          Generate magic links or curate guild, role, and user mappings.
        </Text>
      </Stack>

      {configQuery.isError && (
        <Alert title="Unable to load admin configuration" color="red">
          {formatError(configQuery.error)}
        </Alert>
      )}

      <Tabs defaultValue="magic-link" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="magic-link">Magic link</Tabs.Tab>
          <Tabs.Tab value="user-roles">User roles</Tabs.Tab>
          <Tabs.Tab value="guilds">Guilds</Tabs.Tab>
          <Tabs.Tab value="roles">Roles</Tabs.Tab>
          <Tabs.Tab value="access">Admins &amp; whitelist</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="magic-link" pt="md">
          <Card radius="md" shadow="sm" withBorder>
            <AdminMagicLink />
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="user-roles" pt="md">
          <Card withBorder radius="md">
            <Stack spacing="md">
              <Group position="apart">
                <Title order={4}>Assign user roles</Title>
                <Badge color="blue">{Object.keys(userRoles).length} entries</Badge>
              </Group>

              <form onSubmit={handleUserRoleSubmit}>
                <Stack spacing="sm">
                  <TextInput label="Discord user ID" required {...userRolesForm.getInputProps("userId")} />
                  <TextInput
                    label="Roles (comma separated)"
                    placeholder="127438..., 130598..."
                    required
                    {...userRolesForm.getInputProps("roles")}
                  />
                  <Button
                    type="submit"
                    loading={assignUserRolesMutation.isLoading}
                    disabled={assignUserRolesMutation.isLoading}
                  >
                    Save user roles
                  </Button>
                  {assignUserRolesMutation.isSuccess && (
                    <Text size="sm" color="green">
                      Roles saved.
                    </Text>
                  )}
                  {assignUserRolesMutation.isError && (
                    <Text size="sm" color="red">
                      {formatError(assignUserRolesMutation.error)}
                    </Text>
                  )}
                </Stack>
              </form>

              <Divider />

              <ScrollArea>
                <Table striped highlightOnHover>
                  <thead>
                    <tr>
                      <th>User ID</th>
                      <th>Roles</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userRolesRows.length > 0 ? (
                      userRolesRows
                    ) : (
                      <tr>
                        <td colSpan={3}>
                          <Text size="sm" color="dimmed">
                            No user-specific roles defined yet.
                          </Text>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </ScrollArea>
            </Stack>
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="guilds" pt="md">
          <Card withBorder radius="md">
            <Stack spacing="md">
              <Group position="apart">
                <Title order={4}>Guild configuration</Title>
                <Badge color="blue">{Object.keys(guilds).length} guilds</Badge>
              </Group>
              <form onSubmit={handleGuildSubmit}>
                <Stack spacing="sm">
                  <TextInput label="Guild ID" required {...guildForm.getInputProps("guildId")} />
                  <TextInput label="Friendly name" {...guildForm.getInputProps("name")} />
                  <TextInput
                    label="Required roles (comma separated)"
                    placeholder="127438..."
                    {...guildForm.getInputProps("requiredRole")}
                  />
                  <Button
                    type="submit"
                    loading={upsertGuildMutation.isLoading}
                    disabled={upsertGuildMutation.isLoading}
                  >
                    Save guild
                  </Button>
                  {upsertGuildMutation.isError && (
                    <Text size="sm" color="red">
                      {formatError(upsertGuildMutation.error)}
                    </Text>
                  )}
                </Stack>
              </form>

              <Divider />

              <ScrollArea>
                <Table striped highlightOnHover>
                  <thead>
                    <tr>
                      <th>Guild ID</th>
                      <th>Name</th>
                      <th>Roles</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guildRows.length > 0 ? (
                      guildRows
                    ) : (
                      <tr>
                        <td colSpan={4}>
                          <Text size="sm" color="dimmed">
                            No guild rules configured yet.
                          </Text>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </ScrollArea>
            </Stack>
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="roles" pt="md">
          <Card withBorder radius="md">
            <Stack spacing="md">
              <Group position="apart">
                <Title order={4}>Role catalog</Title>
                <Badge color="blue">{Object.keys(roles).length}</Badge>
              </Group>
              <form onSubmit={handleRoleSubmit}>
                <Stack spacing="sm">
                  <TextInput label="Role ID" required {...roleForm.getInputProps("roleId")} />
                  <TextInput label="Display name" {...roleForm.getInputProps("name")} />
                  <TextInput label="Type" {...roleForm.getInputProps("type")} />
                  <TextInput label="Description" {...roleForm.getInputProps("description")} />
                  <Button
                    type="submit"
                    loading={upsertRoleMutation.isLoading}
                    disabled={upsertRoleMutation.isLoading}
                  >
                    Save role
                  </Button>
                  {upsertRoleMutation.isError && (
                    <Text size="sm" color="red">
                      {formatError(upsertRoleMutation.error)}
                    </Text>
                  )}
                </Stack>
              </form>

              <Divider />

              <ScrollArea>
                <Table striped highlightOnHover>
                  <thead>
                    <tr>
                      <th>Role ID</th>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Description</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roleRows.length > 0 ? (
                      roleRows
                    ) : (
                      <tr>
                        <td colSpan={5}>
                          <Text size="sm" color="dimmed">
                            No roles cataloged yet.
                          </Text>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </ScrollArea>
            </Stack>
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="access" pt="md">
          <Card withBorder radius="md">
            <Stack spacing="sm">
              <Title order={4}>Admins &amp; whitelist</Title>
              <Group spacing="xs" wrap="wrap">
                <Text size="sm" color="dimmed">
                  Admin users
                </Text>
                {adminUsers.length === 0 ? (
                  <Badge color="gray" variant="outline">
                    none
                  </Badge>
                ) : (
                  adminUsers.map((id) => (
                    <Badge key={`admin-${id}`} color="teal" variant="light">
                      {id}
                    </Badge>
                  ))
                )}
              </Group>

              <Group spacing="xs" wrap="wrap">
                <Text size="sm" color="dimmed">
                  Whitelist users
                </Text>
                {whitelistUsers.length === 0 ? (
                  <Badge color="gray" variant="outline">
                    none
                  </Badge>
                ) : (
                  whitelistUsers.map((id) => (
                    <Badge key={`whitelist-${id}`} color="yellow" variant="light">
                      {id}
                    </Badge>
                  ))
                )}
              </Group>
            </Stack>
          </Card>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
