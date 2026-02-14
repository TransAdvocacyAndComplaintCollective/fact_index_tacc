export const ADMIN_CONFIG_QUERY_KEY = ["admin", "config"];

export const PERMISSION_OPTIONS = [
  { value: "facts:read", label: "facts:read" },
  { value: "facts:write", label: "facts:write" },
  { value: "admin:config:read", label: "admin:config:read" },
  { value: "admin:users:write", label: "admin:users:write" },
  { value: "admin:guilds:write", label: "admin:guilds:write" },
  { value: "admin:roles:write", label: "admin:roles:write" },
];

export const FEDERATION_ENTITY_TYPE_OPTIONS = [
  { value: "openid_relying_party", label: "openid_relying_party" },
  { value: "openid_provider", label: "openid_provider" },
  { value: "oauth_client", label: "oauth_client" },
  { value: "oauth_authorization_server", label: "oauth_authorization_server" },
  { value: "oauth_resource", label: "oauth_resource" },
];

export const TRUST_MARK_OPERATOR_OPTIONS = [
  { value: "equals", label: "equals" },
  { value: "includes", label: "includes" },
  { value: "regex", label: "regex" },
  { value: "exists", label: "exists" },
];
