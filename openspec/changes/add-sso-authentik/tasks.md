# Tasks

## 1. Backend: OIDC service

- [x] 1.1 Add `pyjwt[crypto]` to `backend/pyproject.toml` and refresh `uv.lock`; verify `uv lock` succeeds and the image installs it.
- [x] 1.2 Add the `OIDC_*` settings to `backend/app/core/config.py` (enabled, issuer, client id/secret, redirect uri, scopes, auto-provision, ttl, timeout, cookie secure).
- [x] 1.3 Add `create_signed_payload`/`decode_signed_payload` to `backend/app/utils/security.py`; verify a unit test round-trips a payload and rejects tampering and expiry.
- [x] 1.4 Implement `backend/app/services/oidc_service.py`: discovery cache, `build_login_url`, `resolve_callback`, JWKS verification, group→role mapping, access check, optional provisioning; verify with unit tests for role mapping, access, redirect sanitising, id_token validation and callback resolution.

## 2. Backend: HTTP surface

- [x] 2.1 Add `GET /api/v1/auth/oidc/status`, `GET /api/v1/auth/oidc/login` and `GET /api/v1/auth/oidc/callback` in `backend/app/api/v1/routes/auth.py`; verify the status endpoint and the disabled-login redirect with tests.
- [x] 2.2 On callback, issue the app's own token, sync the dashboard scope and redirect to the frontend; verify an end-to-end backend test with a stubbed token endpoint and a signed id_token.

## 3. Frontend

- [x] 3.1 Add `getOidcStatus`/`oidcLoginUrl` to `frontend/src/api/auth.ts` and `frontend/src/lib/oidc.ts` (error map, fragment parser); verify unit tests for the parser and the error map.
- [x] 3.2 Add `frontend/src/pages/OidcCallbackPage.tsx` and the public `/auth/callback` route; verify it stores the session and navigates, and shows a message on error.
- [x] 3.3 Add the "Войти через МКАИР" button and the SSO error banner to `frontend/src/pages/LoginPage.tsx`, shown only when the backend reports SSO enabled.

## 4. Verification and rollout

- [x] 4.1 Run backend `ruff check`/`pytest` and frontend `lint`/`test`/`build`; verify all pass.
- [ ] 4.2 Register the staging redirect URI on the Authentik MetroLog provider and set the staging `OIDC_*` env; verify a real SSO login on Stage.
- [ ] 4.3 Set the production `OIDC_*` env and enable `OIDC_ENABLED`; verify a real SSO login on Prod with a known account.
- [ ] 4.4 After SSO is verified for everyone, disable the legacy login form (keep a break-glass admin path).
