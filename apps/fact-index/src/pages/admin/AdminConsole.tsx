import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "@mantine/form";
import {
  Alert,
  Button,
  Card,
  Group,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthContext } from "../../context/AuthContext";
import { useRBACContext } from "@impelsysinc/react-rbac";
import OpenIdFederationPanel from "./components/OpenIdFederationPanel";
import AccessManagementPanel from "./components/AccessManagementPanel";
import { AdminConfig, DiscordMappingEntry, OpenIdMappingEntry } from "./adminTypes";
import {
  ADMIN_CONFIG_QUERY_KEY,
  PERMISSION_OPTIONS,
} from "./adminConstants";
import { authJson, formatError, toRoleIdSlug } from "./adminApi";

export default function AdminConsole() {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuthContext();
  const { canAccess } = useRBACContext();

  // Authorization checks for different sections
  const canReadConfig = isAdmin || canAccess('admin:config:read');
  const canManageConfig = isAdmin || canAccess('admin:config:write');
  const canReadGuilds = isAdmin || canAccess('admin:guilds:read') || canAccess('admin:guilds:write');
  const canManageGuilds = isAdmin || canAccess('admin:guilds:write');
  const canReadRoles = isAdmin || canAccess('admin:roles:read') || canAccess('admin:roles:write');
  const canManageRoles = isAdmin || canAccess('admin:roles:write');

  if (!canReadConfig) {
    return (
      <Stack gap="md">
        <Alert title="Access denied" color="red">
          <Text>You do not have permission to access the admin console.</Text>
        </Alert>
      </Stack>
    );
  }

  const configQuery = useQuery<AdminConfig>({
    queryKey: ADMIN_CONFIG_QUERY_KEY,
    queryFn: () => authJson("/auth/admin/config"),
  });

  const discordAccessForm = useForm({
    initialValues: {
      mappingId: "",
      discordIdType: "user",
      discordId: "",
      mappingMode: "action",
      localGrant: "facts:read",
      localRoleId: "",
    },
  });
  const openidAccessForm = useForm({
    initialValues: {
      mappingId: "",
      idType: "provider_domain",
      domain: "",
      numHops: 0,
      userId: "",
      mappingMode: "action",
      localGrant: "facts:read",
      localRoleId: "",
    },
  });

  const federationPolicyForm = useForm({
    initialValues: {
      namingConstraintsCsv: "",
      allowSubdomains: true,
      allowedEntityTypes: ["openid_relying_party", "oauth_client"],
      maxPathLength: 2,
      trustAnchorEntityId: "",
      defaultAuthorizationDetailsJson: "[]",
    },
  });

  const trustMarkPolicyForm = useForm({
    initialValues: {
      requiredTrustMarksCsv: "",
      claim: "",
      operator: "equals",
      value: "",
    },
  });
  const trustSuperiorForm = useForm({
    initialValues: {
      trustAnchorEntityId: "",
    },
  });

  const localRoleForm = useForm({
    initialValues: {
      roleId: "",
      permissions: [] as string[],
    },
  });
  const addLocalRoleForm = useForm({
    initialValues: {
      name: "",
    },
  });
  const [addRoleModalOpen, setAddRoleModalOpen] = useState(false);
  const [newTrustMarkType, setNewTrustMarkType] = useState("");

  const removeRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      await authJson(`/auth/admin/roles/${encodeURIComponent(roleId)}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADMIN_CONFIG_QUERY_KEY }),
  });

  const saveLocalRoleMutation = useMutation({
    mutationFn: async (values: {
      roleId: string;
      permissions: string[];
    }) => {
      const roleId = values.roleId.trim();
      if (!roleId) {
        throw new Error("Role ID is required.");
      }
      const permissions = values.permissions.map((item) => item.trim()).filter(Boolean);
      if (!permissions.length) {
        throw new Error("Select at least one action.");
      }

      await authJson("/auth/admin/roles", {
        method: "POST",
        body: JSON.stringify({
          roleId,
          name: roles[roleId]?.name || roleId,
          type: roles[roleId]?.type || "permission",
          description: roles[roleId]?.description || undefined,
          permissions,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_CONFIG_QUERY_KEY });
    },
  });

  const addLocalRoleMutation = useMutation({
    mutationFn: async (values: { name: string }) => {
      const name = values.name.trim();
      if (!name) {
        throw new Error("Role name is required.");
      }
      const roleId = toRoleIdSlug(name);
      if (!roleId) {
        throw new Error("Role name must include letters or numbers.");
      }
      if (roles[roleId]) {
        throw new Error("That local role already exists.");
      }

      await authJson("/auth/admin/roles", {
        method: "POST",
        body: JSON.stringify({
          roleId,
          name,
          type: "permission",
          permissions: [],
        }),
      });
      return { roleId };
    },
    onSuccess: ({ roleId }) => {
      localRoleForm.setValues({ roleId, permissions: [] });
      addLocalRoleForm.reset();
      setAddRoleModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ADMIN_CONFIG_QUERY_KEY });
    },
  });
  const removeDiscordMappingMutation = useMutation({
    mutationFn: async (mappingId: string) => {
      await authJson(`/auth/admin/discord-mappings/${encodeURIComponent(mappingId)}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_CONFIG_QUERY_KEY });
      if (discordAccessForm.values.mappingId) {
        discordAccessForm.reset();
      }
    },
  });
  const removeOpenIdMappingMutation = useMutation({
    mutationFn: async (mappingId: string) => {
      await authJson(`/auth/admin/openid-mappings/${encodeURIComponent(mappingId)}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_CONFIG_QUERY_KEY });
      if (openidAccessForm.values.mappingId) {
        openidAccessForm.reset();
      }
    },
  });

  const config = configQuery.data;
  const guilds = config?.guilds ?? {};
  const roles = config?.roles ?? {};
  const discordMappings = config?.discordMappings ?? [];
  const openidMappings = config?.openidMappings ?? [];
  const roleIds = useMemo(
    () => Object.keys(roles).sort((a, b) => a.localeCompare(b)),
    [roles]
  );
  const loadLocalRoleForEdit = useCallback((roleId: string) => {
    const role = roles[roleId];
    localRoleForm.setValues({
      roleId,
      permissions: Array.isArray(role?.permissions) ? role.permissions.filter(Boolean) : [],
    });
  }, [localRoleForm, roles]);
  const loadDiscordMappingForEdit = useCallback((mapping: DiscordMappingEntry) => {
    const hasGuild = Boolean(mapping.discordGuildId);
    const hasRole = Boolean(mapping.discordRoleId);
    const discordIdType = hasGuild ? "guild" : hasRole ? "role" : "user";
    const discordId = mapping.discordGuildId || mapping.discordRoleId || mapping.discordUserId || "";
    discordAccessForm.setValues({
      mappingId: mapping.id,
      discordIdType,
      discordId,
      mappingMode: mapping.targetType,
      localGrant: mapping.targetType === "action" ? mapping.targetValue : "facts:read",
      localRoleId: mapping.targetType === "role" ? mapping.targetValue : "",
    });
  }, [discordAccessForm]);
  const loadOpenIdMappingForEdit = useCallback((mapping: OpenIdMappingEntry) => {
    openidAccessForm.setValues({
      mappingId: mapping.id,
      idType: mapping.idType,
      domain: mapping.domain || "",
      numHops: typeof mapping.numHops === "number" ? mapping.numHops : 0,
      userId: mapping.userId || "",
      mappingMode: mapping.targetType,
      localGrant: mapping.targetType === "action" ? mapping.targetValue : "facts:read",
      localRoleId: mapping.targetType === "role" ? mapping.targetValue : "",
    });
  }, [openidAccessForm]);

  const localRoleCards = useMemo(() => {
    const items: React.ReactNode[] = [];

    Object.entries(roles)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([roleId, role]) => {
        items.push(
          <Card key={`local-role-${roleId}`} withBorder radius="md" p="sm">
            <Group justify="space-between" align="flex-start" wrap="wrap">
              <Stack gap={2}>
                <Text size="xs" c="dimmed">Role ID</Text>
                <Text style={{ fontFamily: "monospace", fontSize: "0.85rem", overflowWrap: "anywhere" }}>
                  {roleId}
                </Text>
                <Text size="xs" c="dimmed">Name</Text>
                <Text style={{ overflowWrap: "anywhere" }}>{role?.name || "—"}</Text>
              </Stack>
              <Group gap="xs" wrap="nowrap">
                <Button
                  size="xs"
                  variant="default"
                  onClick={() => loadLocalRoleForEdit(roleId)}
                  disabled={removeRoleMutation.isPending}
                >
                  Edit
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  color="red"
                  onClick={() => removeRoleMutation.mutate(roleId)}
                  loading={removeRoleMutation.isPending}
                  disabled={!canManageRoles || removeRoleMutation.isPending}
                >
                  Remove
                </Button>
              </Group>
            </Group>
          </Card>
        );
      });

    return items;
  }, [
    canManageRoles,
    loadLocalRoleForEdit,
    removeRoleMutation,
    roles,
  ]);
  const discordMappingCards = useMemo(() => {
    return [...discordMappings]
      .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""))
      .map((mapping) => {
        const idTypeLabel = mapping.discordGuildId
          ? "Discord Guild ID"
          : mapping.discordRoleId
          ? "Discord Role ID"
          : "Discord User ID";
        const scope = [mapping.discordGuildId, mapping.discordUserId, mapping.discordRoleId]
          .filter(Boolean)
          .join(" | ");
        return (
          <Card key={`discord-mapping-${mapping.id}`} withBorder radius="md" p="sm">
            <Group justify="space-between" align="flex-start" wrap="wrap">
              <Stack gap={4}>
                <Text size="xs" c="dimmed">ID Type</Text>
                <Text fw={600}>{idTypeLabel}</Text>
                <Text size="xs" c="dimmed">Discord Scope</Text>
                <Text fw={600} style={{ overflowWrap: "anywhere" }}>
                  {scope || "Global"}
                </Text>
                <Text size="xs" c="dimmed">Maps To</Text>
                <Text size="sm" style={{ overflowWrap: "anywhere" }}>
                  {mapping.targetType === "role" ? "Local Role" : "Local Action"}: {mapping.targetValue}
                </Text>
              </Stack>
              <Group gap="xs" wrap="nowrap">
                <Button
                  size="xs"
                  variant="default"
                  onClick={() => loadDiscordMappingForEdit(mapping)}
                  disabled={removeDiscordMappingMutation.isPending}
                >
                  Edit
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  color="red"
                  onClick={() => removeDiscordMappingMutation.mutate(mapping.id)}
                  loading={removeDiscordMappingMutation.isPending}
                  disabled={!canManageRoles || removeDiscordMappingMutation.isPending}
                >
                  Remove
                </Button>
              </Group>
            </Group>
          </Card>
        );
      });
  }, [
    canManageRoles,
    discordMappings,
    loadDiscordMappingForEdit,
    removeDiscordMappingMutation,
  ]);
  const openidMappingCards = useMemo(() => {
    return [...openidMappings]
      .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""))
      .map((mapping) => {
        const idTypeLabel =
          mapping.idType === "trust_mark"
            ? "Trust Mark"
            : mapping.idType === "trust_anchor_trust_mark_issuer"
            ? "Trust Anchor - Trust Mark Issuer"
            : mapping.idType === "provider_domain"
            ? "Provider Domain"
            : mapping.idType === "trust_domain"
            ? "Trust Domain"
            : mapping.idType === "issuer_domain_user_id"
            ? "Issuer Domain + User ID"
            : "Anyone";
        return (
          <Card key={`openid-mapping-${mapping.id}`} withBorder radius="md" p="sm">
            <Group justify="space-between" align="flex-start" wrap="wrap">
              <Stack gap={4}>
                <Text size="xs" c="dimmed">ID Type</Text>
                <Text fw={600} style={{ overflowWrap: "anywhere" }}>{idTypeLabel}</Text>
                {mapping.domain ? (
                  <>
                    <Text size="xs" c="dimmed">Domain</Text>
                    <Text style={{ overflowWrap: "anywhere" }}>{mapping.domain}</Text>
                  </>
                ) : (
                  <>
                    <Text size="xs" c="dimmed">Domain</Text>
                    <Text c="dimmed">Any</Text>
                  </>
                )}
                {typeof mapping.numHops === "number" && (
                  <>
                    <Text size="xs" c="dimmed">Num Hops</Text>
                    <Text>{mapping.numHops}</Text>
                  </>
                )}
                {mapping.userId && (
                  <>
                    <Text size="xs" c="dimmed">User ID</Text>
                    <Text style={{ overflowWrap: "anywhere" }}>{mapping.userId}</Text>
                  </>
                )}
                <Text size="xs" c="dimmed">Maps To</Text>
                <Text style={{ overflowWrap: "anywhere" }}>
                  {mapping.targetType === "role" ? "Local Role" : "Local Action"}: {mapping.targetValue}
                </Text>
              </Stack>
              <Group gap="xs" wrap="nowrap">
                <Button
                  size="xs"
                  variant="default"
                  onClick={() => loadOpenIdMappingForEdit(mapping)}
                  disabled={removeOpenIdMappingMutation.isPending}
                >
                  Edit
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  color="red"
                  onClick={() => removeOpenIdMappingMutation.mutate(mapping.id)}
                  loading={removeOpenIdMappingMutation.isPending}
                  disabled={!canManageRoles || removeOpenIdMappingMutation.isPending}
                >
                  Remove
                </Button>
              </Group>
            </Group>
          </Card>
        );
      });
  }, [
    canManageRoles,
    loadOpenIdMappingForEdit,
    openidMappings,
    removeOpenIdMappingMutation,
  ]);

  const localPermissionOptions = useMemo(
    () => PERMISSION_OPTIONS.map((item) => ({ value: item.value, label: item.label })),
    []
  );
  const localRoleSelectOptions = useMemo(
    () => roleIds.map((roleId) => ({ value: roleId, label: roleId })),
    [roleIds]
  );
  const trustMarkSelectOptions = useMemo(() => {
    const configured = (config?.trustMarkPolicy?.requiredTrustMarks || []).map((value) => value.trim()).filter(Boolean);
    const mapped = openidMappings
      .filter(
        (mapping) =>
          (mapping.idType === "trust_mark" || mapping.idType === "trust_anchor_trust_mark_issuer") &&
          Boolean(mapping.domain)
      )
      .map((mapping) => String(mapping.domain).trim())
      .filter(Boolean);
    const merged = Array.from(new Set([...configured, ...mapped])).sort((a, b) => a.localeCompare(b));
    return merged.map((value) => ({ value, label: value }));
  }, [config?.trustMarkPolicy?.requiredTrustMarks, openidMappings]);
  const trustMarkTypeOptions = useMemo(() => {
    const configured = (config?.trustMarkPolicy?.requiredTrustMarks || []).map((value) => value.trim()).filter(Boolean);
    const draft = trustMarkPolicyForm.values.requiredTrustMarksCsv
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    return Array.from(new Set([...configured, ...draft])).sort((a, b) => a.localeCompare(b));
  }, [config?.trustMarkPolicy?.requiredTrustMarks, trustMarkPolicyForm.values.requiredTrustMarksCsv]);

  const saveDiscordAccessMutation = useMutation({
    mutationFn: async (values: {
      mappingId: string;
      discordIdType: string;
      discordId: string;
      mappingMode: string;
      localGrant: string;
      localRoleId: string;
    }) => {
      const discordIdType = (values.discordIdType || "user").trim().toLowerCase();
      const discordId = values.discordId.trim();
      const guildId = discordIdType === "guild" ? discordId : "";
      const userId = discordIdType === "user" ? discordId : "";
      const discordRoleId = discordIdType === "role" ? discordId : "";
      const mappingMode = (values.mappingMode || "action").trim().toLowerCase();
      const localGrant = values.localGrant.trim();
      const localRoleId = values.localRoleId.trim();

      if (discordIdType !== "guild" && discordIdType !== "user" && discordIdType !== "role") {
        throw new Error("Select an ID Type.");
      }
      if (!discordId) {
        throw new Error("Discord ID is required.");
      }
      if (mappingMode !== "action" && mappingMode !== "role") {
        throw new Error("Select a mapping target type.");
      }
      if (mappingMode === "action") {
        if (!localGrant) {
          throw new Error("Local Action is required.");
        }
        if (!localPermissionOptions.some((option) => option.value === localGrant)) {
          throw new Error("Please pick a Local Action from the dropdown.");
        }
      }
      if (mappingMode === "role") {
        if (!localRoleId) {
          throw new Error("Local Role is required.");
        }
        if (!roles[localRoleId]) {
          throw new Error("Selected Local Role does not exist.");
        }
      }
      if (guildId && !canManageGuilds) {
        throw new Error("Guild write permission is required when Discord Guild ID is set.");
      }
      const roleScope = [guildId, userId, discordRoleId].filter(Boolean).join(":") || "generated";
      const actionRoleId = `${toRoleIdSlug(localGrant) || "access"}:${toRoleIdSlug(roleScope)}`;
      const targetValue = mappingMode === "role" ? localRoleId : localGrant;
      const roleId = mappingMode === "role" ? localRoleId : actionRoleId;

      if (mappingMode === "action") {
        // Ensure role exists for action mapping
        await authJson("/auth/admin/roles", {
          method: "POST",
          body: JSON.stringify({
            roleId,
            name: localGrant,
            type: "permission",
            description: `Managed via Discord access mapping (action:${localGrant})`,
            permissions: [localGrant],
          }),
        });
      }

      if (guildId) {
        await authJson("/auth/admin/guilds", {
          method: "POST",
          body: JSON.stringify({
            guildId,
            requiredRole: discordRoleId ? [discordRoleId] : null,
          }),
        });
      }

      await authJson("/auth/admin/discord-mappings", {
        method: "POST",
        body: JSON.stringify({
          id: values.mappingId || undefined,
          discordGuildId: guildId || undefined,
          discordUserId: userId || undefined,
          discordRoleId: discordRoleId || undefined,
          targetType: mappingMode,
          targetValue,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_CONFIG_QUERY_KEY });
      discordAccessForm.reset();
    },
  });
  const saveOpenIdAccessMutation = useMutation({
    mutationFn: async (values: {
      mappingId: string;
      idType: string;
      domain: string;
      numHops: number;
      userId: string;
      mappingMode: string;
      localGrant: string;
      localRoleId: string;
    }) => {
      const idType = (values.idType || "provider_domain").trim().toLowerCase();
      const domain = values.domain.trim().toLowerCase();
      const numHops = Math.max(0, Math.floor(Number(values.numHops || 0)));
      const userId = values.userId.trim();
      const mappingMode = (values.mappingMode || "action").trim().toLowerCase();
      const localGrant = values.localGrant.trim();
      const localRoleId = values.localRoleId.trim();

      if (
        idType !== "trust_mark" &&
        idType !== "trust_anchor_trust_mark_issuer" &&
        idType !== "provider_domain" &&
        idType !== "trust_domain" &&
        idType !== "issuer_domain_user_id" &&
        idType !== "anyone"
      ) {
        throw new Error("Select a valid ID Type.");
      }
      if (idType !== "anyone" && !domain) {
        throw new Error("Domain is required.");
      }
      if ((idType === "trust_domain" || idType === "issuer_domain_user_id") && (!Number.isFinite(numHops) || numHops < 0)) {
        throw new Error("Num Hops must be a non-negative number.");
      }
      if (idType === "issuer_domain_user_id" && !userId) {
        throw new Error("User ID is required for Issuer Domain + User ID.");
      }
      if (mappingMode !== "action" && mappingMode !== "role") {
        throw new Error("Select a mapping target type.");
      }
      if (mappingMode === "action") {
        if (!localGrant) throw new Error("Local Action is required.");
        if (!localPermissionOptions.some((option) => option.value === localGrant)) {
          throw new Error("Please pick a Local Action from the dropdown.");
        }
      }
      if (mappingMode === "role") {
        if (!localRoleId) throw new Error("Local Role is required.");
        if (!roles[localRoleId]) {
          throw new Error("Selected Local Role does not exist.");
        }
      }

      const targetValue = mappingMode === "role" ? localRoleId : localGrant;
      await authJson("/auth/admin/openid-mappings", {
        method: "POST",
        body: JSON.stringify({
          id: values.mappingId || undefined,
          idType,
          domain: idType === "anyone" ? undefined : domain,
          numHops: idType === "trust_domain" || idType === "issuer_domain_user_id" ? numHops : undefined,
          userId: idType === "issuer_domain_user_id" ? userId : undefined,
          targetType: mappingMode,
          targetValue,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_CONFIG_QUERY_KEY });
      openidAccessForm.reset();
    },
  });

  const saveFederationPolicyMutation = useMutation({
    mutationFn: async (values: {
      namingConstraintsCsv: string;
      allowSubdomains: boolean;
      allowedEntityTypes: string[];
      maxPathLength: number;
      trustAnchorEntityId: string;
      defaultAuthorizationDetailsJson: string;
    }) => {
      const namingConstraints = values.namingConstraintsCsv
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

      if (!namingConstraints.length) {
        throw new Error("At least one naming constraint domain is required.");
      }

      if (!values.allowedEntityTypes.length) {
        throw new Error("At least one allowed entity type is required.");
      }

      let defaultAuthorizationDetails: unknown[] = [];
      try {
        const parsed = JSON.parse(values.defaultAuthorizationDetailsJson || "[]");
        if (!Array.isArray(parsed)) {
          throw new Error("Default authorization details must be a JSON array.");
        }
        defaultAuthorizationDetails = parsed;
      } catch (err) {
        throw new Error(
          err instanceof Error ? err.message : "Default authorization details must be valid JSON."
        );
      }

      await authJson("/auth/admin/federation/policy", {
        method: "POST",
        body: JSON.stringify({
          namingConstraints,
          allowSubdomains: values.allowSubdomains,
          allowedEntityTypes: values.allowedEntityTypes,
          maxPathLength: Math.max(0, Math.min(10, Math.round(values.maxPathLength || 0))),
          trustAnchorEntityId: values.trustAnchorEntityId.trim() || undefined,
          defaultAuthorizationDetails,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_CONFIG_QUERY_KEY });
    },
  });

  const saveTrustMarkPolicyMutation = useMutation({
    mutationFn: async (values: {
      requiredTrustMarksCsv: string;
      claim: string;
      operator: string;
      value: string;
    }) => {
      const requiredTrustMarks = values.requiredTrustMarksCsv
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      const claim = values.claim.trim();
      const operator = (values.operator || "equals").trim();
      const payloadClaimChecks = claim
        ? [
            {
              claim,
              operator,
              value: operator === "exists" ? "" : values.value.trim(),
            },
          ]
        : [];

      await authJson("/auth/admin/federation/trust-marks", {
        method: "POST",
        body: JSON.stringify({
          requiredTrustMarks,
          claimChecks: payloadClaimChecks,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_CONFIG_QUERY_KEY });
    },
  });
  const saveTrustSuperiorMutation = useMutation({
    mutationFn: async (values: {
      trustAnchorEntityId: string;
    }) => {
      const trustAnchorEntityId = values.trustAnchorEntityId.trim();
      if (!trustAnchorEntityId) {
        throw new Error("Immediate superior entity ID is required.");
      }
      try {
        new URL(trustAnchorEntityId);
      } catch {
        throw new Error("Immediate superior entity ID must be a valid URL.");
      }

      await authJson("/auth/admin/federation/trust-superior", {
        method: "POST",
        body: JSON.stringify({
          trustAnchorEntityId,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_CONFIG_QUERY_KEY });
    },
  });

  const handleDiscordAccessSubmit = discordAccessForm.onSubmit((values) => {
    saveDiscordAccessMutation.mutate(values);
  });
  const handleOpenIdAccessSubmit = openidAccessForm.onSubmit((values) => {
    saveOpenIdAccessMutation.mutate(values);
  });

  const handleFederationPolicySubmit = federationPolicyForm.onSubmit((values) => {
    saveFederationPolicyMutation.mutate(values);
  });

  const handleTrustMarkPolicySubmit = trustMarkPolicyForm.onSubmit((values) => {
    saveTrustMarkPolicyMutation.mutate(values);
  });
  const handleTrustSuperiorSubmit = trustSuperiorForm.onSubmit((values) => {
    saveTrustSuperiorMutation.mutate(values);
  });
  const handleAddTrustMarkType = useCallback(() => {
    const value = newTrustMarkType.trim();
    if (!value) return;
    if (trustMarkTypeOptions.includes(value)) {
      setNewTrustMarkType("");
      return;
    }
    const merged = [...trustMarkTypeOptions, value].sort((a, b) => a.localeCompare(b));
    trustMarkPolicyForm.setFieldValue("requiredTrustMarksCsv", merged.join(", "));
    setNewTrustMarkType("");
  }, [newTrustMarkType, trustMarkPolicyForm, trustMarkTypeOptions]);

  const handleLocalRoleSubmit = localRoleForm.onSubmit((values) => {
    saveLocalRoleMutation.mutate(values);
  });

  const handleAddLocalRoleSubmit = addLocalRoleForm.onSubmit((values) => {
    addLocalRoleMutation.mutate(values);
  });

  useEffect(() => {
    const policy = config?.federationPolicy;
    if (!policy) return;

    federationPolicyForm.setValues({
      namingConstraintsCsv: (policy.namingConstraints || []).join(", "),
      allowSubdomains: policy.allowSubdomains ?? true,
      allowedEntityTypes: (policy.allowedEntityTypes || ["openid_relying_party", "oauth_client"]).filter(Boolean),
      maxPathLength: Number.isInteger(policy.maxPathLength) ? policy.maxPathLength : 2,
      trustAnchorEntityId: policy.trustAnchorEntityId || "",
      defaultAuthorizationDetailsJson: JSON.stringify(policy.defaultAuthorizationDetails || [], null, 2),
    });
  }, [config?.federationPolicy]);

  useEffect(() => {
    const trustMarks = config?.trustMarkPolicy;
    if (!trustMarks) return;

    const firstCheck = trustMarks.claimChecks?.[0];
    trustMarkPolicyForm.setValues({
      requiredTrustMarksCsv: (trustMarks.requiredTrustMarks || []).join(", "),
      claim: firstCheck?.claim || "",
      operator: (firstCheck?.operator as string) || "equals",
      value: firstCheck?.value || "",
    });
  }, [config?.trustMarkPolicy]);
  useEffect(() => {
    trustSuperiorForm.setValues({
      trustAnchorEntityId: config?.federationPolicy?.trustAnchorEntityId || "",
    });
  }, [config?.federationPolicy?.trustAnchorEntityId]);

  return (
    <Stack gap="xl">
      <Stack gap="xs">
        <Title>Admin console</Title>
        <Text size="sm" color="dimmed">
          Manage access mappings, roles, and federation settings using RBAC actions.
        </Text>
      </Stack>

      {configQuery.isError && (
        <Alert title="Unable to load admin configuration" color="red">
          {formatError(configQuery.error)}
        </Alert>
      )}

      <Tabs defaultValue="access-management" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab
            value="access-management"
            disabled={!canReadGuilds && !canReadRoles}
          >
            Access Management
          </Tabs.Tab>
          <Tabs.Tab value="openid-federation">OpenID Federation</Tabs.Tab>
        </Tabs.List>

        <AccessManagementPanel
          guilds={guilds}
          roles={roles}
          canReadGuilds={canReadGuilds}
          canReadRoles={canReadRoles}
          canManageRoles={canManageRoles}
          localRoleCards={localRoleCards}
          discordMappingCards={discordMappingCards}
          openidMappingCards={openidMappingCards}
          localRoleSelectOptions={localRoleSelectOptions}
          localPermissionOptions={localPermissionOptions}
          trustMarkSelectOptions={trustMarkSelectOptions}
          addRoleModalOpen={addRoleModalOpen}
          setAddRoleModalOpen={setAddRoleModalOpen}
          addLocalRoleForm={addLocalRoleForm}
          addLocalRoleMutation={addLocalRoleMutation}
          handleAddLocalRoleSubmit={handleAddLocalRoleSubmit}
          discordAccessForm={discordAccessForm}
          saveDiscordAccessMutation={saveDiscordAccessMutation}
          handleDiscordAccessSubmit={handleDiscordAccessSubmit}
          localRoleForm={localRoleForm}
          saveLocalRoleMutation={saveLocalRoleMutation}
          handleLocalRoleSubmit={handleLocalRoleSubmit}
          loadLocalRoleForEdit={loadLocalRoleForEdit}
          openidAccessForm={openidAccessForm}
          saveOpenIdAccessMutation={saveOpenIdAccessMutation}
          handleOpenIdAccessSubmit={handleOpenIdAccessSubmit}
          formatError={formatError}
        />

        <OpenIdFederationPanel
          canManageConfig={canManageConfig}
          config={config}
          federationPolicyForm={federationPolicyForm}
          trustSuperiorForm={trustSuperiorForm}
          trustMarkPolicyForm={trustMarkPolicyForm}
          handleFederationPolicySubmit={handleFederationPolicySubmit}
          handleTrustSuperiorSubmit={handleTrustSuperiorSubmit}
          handleTrustMarkPolicySubmit={handleTrustMarkPolicySubmit}
          saveFederationPolicyMutation={saveFederationPolicyMutation}
          saveTrustSuperiorMutation={saveTrustSuperiorMutation}
          saveTrustMarkPolicyMutation={saveTrustMarkPolicyMutation}
          trustMarkTypeOptions={trustMarkTypeOptions}
          newTrustMarkType={newTrustMarkType}
          setNewTrustMarkType={setNewTrustMarkType}
          handleAddTrustMarkType={handleAddTrustMarkType}
          formatError={formatError}
        />
      </Tabs>
    </Stack>
  );
}
