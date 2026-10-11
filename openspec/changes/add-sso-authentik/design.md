# Design

## Context

metroLog authenticates with an email/password login and issues an HMAC-signed
token (`app/utils/security.py`). Users live in the local `users` table with a
role (`DEVELOPER`/`ADMINISTRATOR`/`MKAIR`/`CUSTOMER`) and folder scoping.

Authentik (`auth.mkair-it.ru`) is a Django/OpenID Connect provider. It already
holds the metroLog/metroGen accounts, and their existing password hashes were
imported verbatim, so people can authenticate there with the password they
already use. Its `groups` claim carries `metrolog-users` and the role groups
(`metrolog-developer`, `metrolog-administrator`, `metrolog-mkair`,
`metrolog-customer`).

## Goals / Non-goals

- **Goal**: let a user sign in to metroLog through Authentik, with roles driven by
  the IdP groups, without breaking the password login or the session model.
- **Goal**: no password reset for anyone.
- **Non-goal**: removing the password login. It stays as a break-glass path until
  a later cutover.
- **Non-goal**: single logout / session revocation against Authentik.

## Decisions

### Keep the app's own session token

Authentik proves *who* the user is; metroLog then issues the same HMAC token it
always did. Every existing guard (`get_current_user`, `require_admin`,
`require_operator`) and every request path stays unchanged, and the SSO flow
cannot leak an Authentik token into the app's authorization decisions.

### Authorization code + PKCE, state and nonce

The backend starts the flow, generates `state`, `nonce` and a PKCE verifier, and
stores them in a short-lived **signed HttpOnly cookie** scoped to the callback
path. The callback verifies `state` (constant-time), exchanges the code with the
verifier, and verifies the identity token against the provider JWKS
(`iss`, `aud`, `exp`, `iat`, `nonce`). PKCE protects the code exchange even
though the client is confidential.

### Link by email, never auto-create by default

Users are matched to the local `users` row by lower-cased `email`. An unknown
email is refused (`unknown_user`) unless `OIDC_AUTO_PROVISION` is on. Refusing is
the safe default: metroLog accounts are curated, and folder scoping lives on the
local row.

### Roles come from the IdP groups

The `groups` claim is mapped to a role (most privileged match wins). If no role
group is present, the local role is kept. Membership in `metrolog-users` (or any
`metrolog-*` group) is required to sign in at all; the Authentik application
binding already restricts access, this is defence in depth.

### The token reaches the SPA in the fragment

The callback redirects to `/auth/callback#token=…&redirect=…`. A fragment is never
sent to the server, so the session token cannot appear in nginx access logs, the
`Referer` header or a proxy log. The SPA reads it, calls `/auth/me` to load the
user, and stores it exactly like the password login does.

### Behind a flag

`OIDC_ENABLED` (and a configured secret) gate everything. `/auth/oidc/status`
tells the frontend whether to show the button. With the flag off, behaviour is
byte-for-byte the old login.

## Risks / Trade-offs

- **Unofficial Authentik extension** (the legacy password hasher) is a separate
  concern; this change only consumes standard OIDC, so it is unaffected by
  Authentik upgrades.
- **Email as the link key**: an email change in the IdP would need the local row
  updated. The identity token `sub` is not used for linking on purpose (it is a
  hashed id), so a change of `sub` does not silently attach a wrong account.
- **Shared workstations**: the flow does not implement RP-initiated logout, so an
  Authentik session can outlive the app session. Out of scope here; noted for the
  cutover step.
