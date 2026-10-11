# Proposal

## Why

metroLog, metroGen and metroCheck each keep their own password. People remember
several credentials, administrators reset passwords by hand, and there is no
single place to disable someone who leaves. An Authentik instance already runs on
the same host with OIDC providers for all three services, and the existing
metroLog/metroGen password hashes were migrated into it without resets. metroLog
still has no way to actually sign in through it.

## What Changes

- Add an **Authentik OIDC** login to metroLog: authorization code flow with PKCE,
  identity token verified against the provider's JWKS, users linked by email.
- Map the Authentik **`groups` claim** to the metroLog role, so access is managed
  centrally; the local database keeps folder scoping and profile data.
- Keep the existing email/password login untouched and keep issuing the app's own
  HMAC session token, so every existing guard, request and test keeps working.
- Put SSO behind `OIDC_ENABLED`, so nothing changes until it is switched on per
  environment.
- Show a "Войти через МКАИР" button on the login screen only when the backend
  reports SSO enabled, plus a dedicated callback route.

## Capabilities

### New Capabilities
- `sso`: signing in through Authentik OIDC, linking the external identity to a
  metroLog user, mapping IdP groups to a role, and the callback hand-off to the
  single-page app.

### Modified Capabilities
_None: the password login keeps its current behaviour._

## Impact

- `backend/app/services/oidc_service.py` (new), `app/api/v1/routes/auth.py`,
  `app/core/config.py`, `app/utils/security.py` (signed-payload helpers),
  new dependency `pyjwt[crypto]`.
- `frontend/src/lib/oidc.ts`, `src/pages/OidcCallbackPage.tsx`,
  `src/pages/LoginPage.tsx`, `src/api/auth.ts`, `src/app/router.tsx`.
- Configuration: new `OIDC_*` environment variables on the server.
- No database migration; no change to existing endpoints or their contracts.
