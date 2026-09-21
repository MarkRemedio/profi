# MFA / SSO

**Status:** Partial
**Category:** Cross-cutting

## What this is

Multi-factor authentication (TOTP, WebAuthn) and Single Sign-On (SAML/OIDC) for accountants who manage many client orgs.

## Current state

- Login uses Supabase Auth defaults (see [lib/supabase/](../../../lib/supabase/), [app/(public)/login/](<../../../app/(public)/login/>)).
- No MFA enforcement policy.
- No SAML / SSO IdP integration.
- No device-trust or session-revocation UI.

## Why it's needed

- Finance data warrants MFA — competitors enforce it by default.
- Accountancy firms expect SSO so client logins flow through the firm IdP.

## Recommended approach

- Supabase already supports TOTP MFA — enable it and enforce per-org policy.
- WebAuthn / passkeys via Supabase or a layer on top.
- For SSO, Supabase has SAML in their enterprise tier, or use WorkOS for SAML+SCIM.

## Implementation notes

- "Enforce MFA" should be an org setting that owners toggle.
- Step-up auth for sensitive actions (period close, VAT submission, user-role change).

## Related

- [RBAC](rbac.md), [Audit-trail UI](audit-trail-ui.md), [Rate limiting](../architecture/rate-limiting.md)
