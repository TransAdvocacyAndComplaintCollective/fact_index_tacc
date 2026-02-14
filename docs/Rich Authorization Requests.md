# Rich Authorization Requests (RAR) with OpenID Federation

This project now supports passing `authorization_details` into the federation login flow.

## Entry point

Use:

`GET /auth/federation/login?op=<entity_id>&authorization_details=<json-array>`

This endpoint also supports OAuth 2.0 authorization request parameters.

`authorization_details` must be a JSON array, and each item must include `type`.

Example:

```text
/auth/federation/login?op=https%3A%2F%2Fidp.example.org&authorization_details=%5B%7B%22type%22%3A%22openid_credential%22%2C%22credential_type%22%3A%22UniversityDegreeCredential%22%7D%5D
```

## Supported aliases

The login route accepts:

- `authorization_details`
- `authorizationDetails`
- `rar`

## OAuth 2.0 Authorization Request Parameters

The federation login endpoint allowlists and forwards these parameters:

- `resource`
- `audience`
- `prompt`
- `login_hint`
- `acr_values`
- `ui_locales`
- `claims` (must be valid JSON object)
- `nonce`

## Validation rules

- Must be valid JSON
- Must be an array
- Must not be empty
- Max 20 entries
- Every entry must be an object with non-empty `type`

## Default RAR (optional)

Set environment variable `FEDERATION_AUTHORIZATION_DETAILS` to a JSON array.

If request query does not include RAR, the server will use this default.

### Admin Console default

You can also set default RAR from Admin Console:

- `OpenID Federation`
- `Trust Anchor - Federation-wide policy`
- `Default Rich Authorization Request (authorization_details JSON)`

Stored at:

`federationPolicy.defaultAuthorizationDetails`

Resolution order is:

1. Query (`authorization_details` / `authorizationDetails` / `rar`)
2. Admin config (`federationPolicy.defaultAuthorizationDetails`)
3. Env (`FEDERATION_AUTHORIZATION_DETAILS`)

## Federation Claim-to-Permission Mapping

In Admin Console under:

- `OpenID Federation`
- `Trust Anchor - Federation-wide policy`
- `Permission Assignments (JSON)`

You can define mappings using trust anchor, issuer entity, subject entity, and claims.

Example:

```json
[
  {
    "trustAnchorEntityId": "https://ta.example.org",
    "issuerEntityId": "https://idp.example.org",
    "subjectEntityId": "did:example:alice",
    "claimPath": "acr",
    "claimOperator": "equals",
    "claimValue": "loa3",
    "permissions": ["facts:read", "facts:write"]
  },
  {
    "issuerEntityId": "https://idp.example.org",
    "claimPath": "email",
    "claimOperator": "regex",
    "claimValue": ".*@example\\.org$",
    "permissions": ["admin:config:read"]
  }
]
```

Supported `claimOperator` values:

- `equals`
- `includes`
- `regex`
- `exists`

## Frontend forwarding

`/login/federation` now forwards RAR query values to `/auth/federation/login`, so this works:

```text
/login/federation?provider=https%3A%2F%2Fidp.example.org&authorization_details=%5B%7B%22type%22%3A%22payment_initiation%22%2C%22instructedAmount%22%3A%7B%22currency%22%3A%22USD%22%2C%22amount%22%3A%2210.00%22%7D%7D%5D
```
