import React from "react";
import type { UseFormReturnType } from "@mantine/form";
import {
  Alert,
  Button,
  Card,
  Group,
  MultiSelect,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import type { RoleEntry } from "../adminTypes";

type MutationState = {
  isPending: boolean;
  isError: boolean;
  error: unknown;
};

type RolePermissionsValues = {
  roleId: string;
  permissions: string[];
};

type UserPermissionsValues = {
  userId: string;
  permissions: string[];
};

type WhitelistValues = {
  userId: string;
};

type AccessManagementPanelProps = {
  roles: Record<string, RoleEntry>;
  userPermissions: Record<string, string[]>;
  knownUsers: Array<{ userId: string; username: string | null; firstSeenAt: string; lastSeenAt: string }>;
  whitelistUsers: string[];
  permissionOptions: Array<{ value: string; label: string }>;

  canManageRoles: boolean;
  canManageUsers: boolean;
  canManageWhitelist: boolean;

  configuredRoleIds: string[];
  configuredUserIds: string[];

  accessInnerTab: string | null;
  onAccessInnerTabChange: (value: string | null) => void;

  rolePermissionsForm: UseFormReturnType<RolePermissionsValues>;
  userPermissionsForm: UseFormReturnType<UserPermissionsValues>;
  whitelistForm: UseFormReturnType<WhitelistValues>;

  handleRolePermissionsSubmit: (event?: React.FormEvent<HTMLFormElement>) => void;
  handleUserPermissionsSubmit: (event?: React.FormEvent<HTMLFormElement>) => void;
  handleWhitelistSubmit: (event?: React.FormEvent<HTMLFormElement>) => void;

  saveRolePermissionsMutation: MutationState;
  saveUserPermissionsMutation: MutationState;
  removeUserPermissionsMutation: MutationState & { mutate: (userId: string) => void };
  addWhitelistMutation: MutationState;
  removeWhitelistMutation: MutationState & { mutate: (userId: string) => void };

  formatError: (error: unknown) => string;
};

function rolePermissionCount(role: RoleEntry | undefined): number {
  const permissions = role?.permissions;
  if (!Array.isArray(permissions)) return 0;
  return permissions.filter(Boolean).length;
}

export default function AccessManagementPanel({
  roles,
  userPermissions,
  knownUsers,
  whitelistUsers,
  permissionOptions,
  canManageRoles,
  canManageUsers,
  canManageWhitelist,
  configuredRoleIds,
  configuredUserIds,
  accessInnerTab,
  onAccessInnerTabChange,
  rolePermissionsForm,
  userPermissionsForm,
  whitelistForm,
  handleRolePermissionsSubmit,
  handleUserPermissionsSubmit,
  handleWhitelistSubmit,
  saveRolePermissionsMutation,
  saveUserPermissionsMutation,
  removeUserPermissionsMutation,
  addWhitelistMutation,
  removeWhitelistMutation,
  formatError,
}: AccessManagementPanelProps) {
  const rolesWithPermissions = configuredRoleIds.filter((roleId) => rolePermissionCount(roles?.[roleId]) > 0);
  const usersWithPermissions = configuredUserIds.filter((userId) => (userPermissions?.[userId] || []).length > 0);
  const knownUsersSelectData = (knownUsers || [])
    .map((u) => {
      const userId = String(u.userId || "").trim();
      if (!userId) return null;
      const username = u.username ? String(u.username).trim() : "";
      const label = username ? `${username} (${userId})` : userId;
      return { value: userId, label };
    })
    .filter((v): v is { value: string; label: string } => Boolean(v));

  return (
    <Tabs.Panel value="access-management" pt="md">
      <Stack gap="md">
        <Tabs value={accessInnerTab} onChange={onAccessInnerTabChange} keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="roles">Role Permissions</Tabs.Tab>
            <Tabs.Tab value="users">User Permissions</Tabs.Tab>
            <Tabs.Tab value="whitelist">Whitelist</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="roles" pt="md">
            <Card withBorder radius="md">
              <Stack gap="md">
                <Title order={5}>Role Permissions</Title>
                <Text size="sm" c="dimmed">
                  Assign permissions to a role ID. These apply to any logged-in user who has that role.
                </Text>

                <form onSubmit={handleRolePermissionsSubmit}>
                  <Stack gap="sm">
                    <TextInput
                      label="Role ID"
                      placeholder="123456789012345678"
                      required
                      disabled={!canManageRoles || saveRolePermissionsMutation.isPending}
                      {...rolePermissionsForm.getInputProps("roleId")}
                    />
                    <MultiSelect
                      label="Permissions"
                      placeholder="Select permissions"
                      data={permissionOptions}
                      searchable
                      nothingFoundMessage="No permissions found"
                      disabled={!canManageRoles || saveRolePermissionsMutation.isPending}
                      error={rolePermissionsForm.errors.permissions}
                      value={rolePermissionsForm.values.permissions}
                      onChange={(value) => rolePermissionsForm.setFieldValue("permissions", value)}
                    />
                    <Group>
                      <Button
                        type="submit"
                        loading={saveRolePermissionsMutation.isPending}
                        disabled={
                          !canManageRoles ||
                          saveRolePermissionsMutation.isPending ||
                          !String(rolePermissionsForm.values.roleId || "").trim() ||
                          (rolePermissionsForm.values.permissions || []).length === 0
                        }
                      >
                        Save
                      </Button>
                      <Button type="button" variant="default" onClick={() => rolePermissionsForm.reset()} disabled={saveRolePermissionsMutation.isPending}>
                        Reset
                      </Button>
                    </Group>
                    {saveRolePermissionsMutation.isError && (
                      <Text size="sm" c="red">
                        {formatError(saveRolePermissionsMutation.error)}
                      </Text>
                    )}
                    {!canManageRoles && (
                      <Alert color="orange" variant="light" title="Read-only">
                        You do not have permission to edit role permissions.
                      </Alert>
                    )}
                  </Stack>
                </form>

                {rolesWithPermissions.length ? (
                  <Stack gap="xs">
                    {rolesWithPermissions.map((roleId) => (
                      <Card key={roleId} withBorder radius="md" p="sm">
                        <Group justify="space-between" wrap="nowrap">
                          <Stack gap={2}>
                            <Text fw={600}>{roleId}</Text>
                            <Text size="sm" c="dimmed">
                              {rolePermissionCount(roles[roleId])} permissions
                            </Text>
                          </Stack>
                          <Button
                            variant="default"
                            onClick={() =>
                              rolePermissionsForm.setValues({
                                roleId,
                                permissions: Array.isArray(roles[roleId]?.permissions)
                                  ? (roles[roleId]!.permissions as any)
                                  : [],
                              })
                            }
                          >
                            Edit
                          </Button>
                        </Group>
                      </Card>
                    ))}
                  </Stack>
                ) : (
                  <Alert color="gray" variant="light">
                    No roles configured yet.
                  </Alert>
                )}
              </Stack>
            </Card>
          </Tabs.Panel>

          <Tabs.Panel value="users" pt="md">
            <Stack gap="md">
              <Card withBorder radius="md">
                <Stack gap="md">
                  <Title order={5}>User Permissions</Title>
                  <Text size="sm" c="dimmed">
                    Assign permissions directly to a Discord user ID. This works even before the user has logged in.
                  </Text>

                  <form onSubmit={handleUserPermissionsSubmit}>
                    <Stack gap="sm">
                      <Select
                        label="Pick a known user"
                        placeholder={knownUsersSelectData.length ? "Search users" : "No known users yet"}
                        data={knownUsersSelectData}
                        searchable
                        clearable
                        nothingFoundMessage="No users found"
                        disabled={!canManageUsers || saveUserPermissionsMutation.isPending || knownUsersSelectData.length === 0}
                        value={userPermissionsForm.values.userId || null}
                        onChange={(value) => userPermissionsForm.setFieldValue("userId", value || "")}
                      />
                      <TextInput
                        label="User ID"
                        placeholder="123456789012345678"
                        required
                        disabled={!canManageUsers || saveUserPermissionsMutation.isPending}
                        {...userPermissionsForm.getInputProps("userId")}
                      />
                      <MultiSelect
                        label="Permissions"
                        placeholder="Select permissions"
                        data={permissionOptions}
                        searchable
                        nothingFoundMessage="No permissions found"
                        disabled={!canManageUsers || saveUserPermissionsMutation.isPending}
                        error={userPermissionsForm.errors.permissions}
                        value={userPermissionsForm.values.permissions}
                        onChange={(value) => userPermissionsForm.setFieldValue("permissions", value)}
                      />
                      <Group>
                        <Button
                          type="submit"
                          loading={saveUserPermissionsMutation.isPending}
                          disabled={
                            !canManageUsers ||
                            saveUserPermissionsMutation.isPending ||
                            !String(userPermissionsForm.values.userId || "").trim() ||
                            (userPermissionsForm.values.permissions || []).length === 0
                          }
                        >
                          Save
                        </Button>
                        <Button type="button" variant="default" onClick={() => userPermissionsForm.reset()} disabled={saveUserPermissionsMutation.isPending}>
                          Reset
                        </Button>
                      </Group>
                      {saveUserPermissionsMutation.isError && (
                        <Text size="sm" c="red">
                          {formatError(saveUserPermissionsMutation.error)}
                        </Text>
                      )}
                      {!canManageUsers && (
                        <Alert color="orange" variant="light" title="Read-only">
                          You do not have permission to edit user permissions.
                        </Alert>
                      )}
                    </Stack>
                  </form>

                  {usersWithPermissions.length ? (
                    <Stack gap="xs">
                      {usersWithPermissions.map((userId) => (
                        <Card key={userId} withBorder radius="md" p="sm">
                          <Group justify="space-between" wrap="nowrap">
                            <Stack gap={2}>
                              <Text fw={600}>{userId}</Text>
                              <Text size="sm" c="dimmed">
                                {(userPermissions[userId] || []).length} permissions
                              </Text>
                            </Stack>
                            <Group gap="xs" wrap="nowrap">
                              <Button
                                variant="default"
                                onClick={() =>
                                  userPermissionsForm.setValues({
                                    userId,
                                    permissions: Array.isArray(userPermissions[userId]) ? userPermissions[userId] : [],
                                  })
                                }
                              >
                                Edit
                              </Button>
                              <Button
                                color="red"
                                variant="light"
                                loading={removeUserPermissionsMutation.isPending}
                                disabled={!canManageUsers || removeUserPermissionsMutation.isPending}
                                onClick={() => removeUserPermissionsMutation.mutate(userId)}
                              >
                                Remove
                              </Button>
                            </Group>
                          </Group>
                        </Card>
                      ))}
                    </Stack>
                  ) : (
                    <Alert color="gray" variant="light">
                      No user permissions configured yet.
                    </Alert>
                  )}
                </Stack>
              </Card>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="whitelist" pt="md">
            <Card withBorder radius="md">
              <Stack gap="md">
                <Title order={5}>Whitelist</Title>
                <Text size="sm" c="dimmed">
                  Allow a user ID to log in even if they are missing the required guild or role.
                </Text>

                <form onSubmit={handleWhitelistSubmit}>
                  <Stack gap="sm">
                    <TextInput
                      label="User ID"
                      placeholder="123456789012345678"
                      required
                      disabled={!canManageWhitelist || addWhitelistMutation.isPending}
                      {...whitelistForm.getInputProps("userId")}
                    />
                    <Button type="submit" loading={addWhitelistMutation.isPending} disabled={!canManageWhitelist || addWhitelistMutation.isPending}>
                      Add to whitelist
                    </Button>
                    {addWhitelistMutation.isError && (
                      <Text size="sm" c="red">
                        {formatError(addWhitelistMutation.error)}
                      </Text>
                    )}
                    {!canManageWhitelist && (
                      <Alert color="orange" variant="light" title="Read-only">
                        You do not have permission to edit the whitelist.
                      </Alert>
                    )}
                  </Stack>
                </form>

                {whitelistUsers.length ? (
                  <Stack gap="xs">
                    {whitelistUsers.map((userId) => (
                      <Card key={userId} withBorder radius="md" p="sm">
                        <Group justify="space-between" wrap="nowrap">
                          <Text fw={600}>{userId}</Text>
                          <Button
                            color="red"
                            variant="light"
                            loading={removeWhitelistMutation.isPending}
                            disabled={!canManageWhitelist || removeWhitelistMutation.isPending}
                            onClick={() => removeWhitelistMutation.mutate(userId)}
                          >
                            Remove
                          </Button>
                        </Group>
                      </Card>
                    ))}
                  </Stack>
                ) : (
                  <Alert color="gray" variant="light">
                    No users are whitelisted.
                  </Alert>
                )}
              </Stack>
            </Card>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Tabs.Panel>
  );
}
