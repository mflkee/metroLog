# Spec Delta

## Purpose

Allows metroLog users to sign in through the shared Authentik identity provider
(OpenID Connect) while keeping the application's own session token, role model
and folder scoping.

## ADDED Requirements

### Requirement: SSO availability

The system SHALL expose whether single sign-on is enabled, and SHALL keep the
password login fully functional regardless of that setting. Single sign-on SHALL
be disabled unless an explicit flag and a client secret are configured.

#### Scenario: SSO disabled
- **WHEN** `OIDC_ENABLED` is off
- **THEN** the status endpoint reports `enabled: false`, the login screen offers only email/password, and starting the SSO flow redirects back to the login screen with an error

#### Scenario: SSO enabled
- **WHEN** the flag is on and a client secret is set
- **THEN** the status endpoint reports `enabled: true` and the login screen offers the "Войти через МКАИР" button

### Requirement: Authorization request

The system SHALL start the flow with an authorization-code request that uses
PKCE (S256), a random `state` and a random `nonce`, and SHALL remember them
together with the requested post-login path in a signed, HttpOnly, short-lived
cookie scoped to the callback path.

#### Scenario: Start login
- **WHEN** a user opens the SSO login endpoint with an optional local redirect path
- **THEN** the system responds with a redirect to the provider's authorization endpoint carrying `response_type=code`, the configured client id and redirect uri, the requested scopes, `state`, `nonce`, and the S256 code challenge, and sets the transaction cookie

#### Scenario: Redirect target is sanitised
- **WHEN** the requested post-login path is absent, absolute, or protocol-relative
- **THEN** the system remembers no redirect and later sends the user to the default landing page

### Requirement: Callback validation

The system SHALL validate the callback before trusting anything: the transaction
cookie MUST be present and unexpired, `state` MUST match the cookie in constant
time, the code MUST be exchanged with the PKCE verifier at the token endpoint,
and the identity token MUST be verified against the provider's published keys
with the expected issuer and audience, a valid lifetime, and a `nonce` matching
the transaction.

#### Scenario: Valid callback
- **WHEN** the state matches and the identity token verifies
- **THEN** the flow proceeds to resolve the user

#### Scenario: Missing or tampered transaction
- **WHEN** the transaction cookie is absent, tampered with, or expired, or the state does not match
- **THEN** no code is exchanged and the user is redirected to the login screen with an error

#### Scenario: Invalid identity token
- **WHEN** the identity token fails signature, issuer, audience, lifetime or nonce checks
- **THEN** the user is redirected to the login screen with an error and no session is created

### Requirement: User resolution and role mapping

The system SHALL resolve the identity to a local user by email, SHALL refuse
identities that carry no `metrolog-*` group, SHALL refuse unknown emails unless
automatic provisioning is explicitly enabled, and SHALL map the `groups` claim to
a role, preferring the most privileged match. When no role group is present the
local role SHALL be preserved. Inactive users SHALL be refused.

#### Scenario: Known user with a role group
- **WHEN** a user in `metrolog-users` and `metrolog-mkair` signs in and their local role is `CUSTOMER`
- **THEN** their role becomes `MKAIR` and their last login time is updated

#### Scenario: Identity without a metrolog group
- **WHEN** the identity's groups contain no `metrolog-*` group
- **THEN** the system refuses the login

#### Scenario: Unknown email
- **WHEN** the verified email has no local user and provisioning is off
- **THEN** the system refuses the login

#### Scenario: Inactive local user
- **WHEN** the resolved local user is inactive
- **THEN** the system refuses the login

### Requirement: Session hand-off

On success the system SHALL issue the application's own session token and deliver
it to the single-page app without exposing it to the server or proxy logs, then
clear the transaction cookie.

#### Scenario: Successful hand-off
- **WHEN** the callback succeeds
- **THEN** the system redirects to the app's callback route with the session token and the post-login path in the URL fragment, and clears the transaction cookie

#### Scenario: The app completes the session
- **WHEN** the callback page receives a token
- **THEN** it loads the current user, stores the session like the password login, and navigates to the post-login path, or to the profile page when a password change is required

#### Scenario: Callback reports an error
- **WHEN** the callback page receives an error code instead of a token
- **THEN** it shows a human-readable message and a link back to the login screen
