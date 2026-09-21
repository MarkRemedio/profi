# Smart-account-setup footer banner is redundant once COA has rows

**Audit priority:** Low (UX polish)
**Section:** Chart of Accounts — UI

## What the auditor saw

The bottom of the COA page shows two cards:

- **Audit readiness** ("Your Chart of Accounts is structured for clean reporting…")
- **Smart account setup** with a "Create starter accounts" CTA

The "Smart account setup" card is **always** shown — even when the user already has 29 active accounts. This is *onboarding debt*: a setup prompt that should disappear once setup is done.

## The auditor's recommendation

> Remove this banner entirely once the account count is greater than zero, or at the very least, provide a permanent dismissal option … Eliminating this 'onboarding debt' would streamline the workspace and allow the interface to evolve with the user's journey rather than repeatedly prompting them to perform a setup step they have already completed.

## What to do

- Hide the "Smart account setup" card when `accountCount > 0` (or some threshold like > 5 to allow for a partial start).
- If kept visible, add a per-user "Don't show again" dismissal that persists.
- Audit-readiness card can stay; it's informational, not onboarding.

## Implementation notes

- Persist dismissal in a `UserPreference` table or in `localStorage` if a model isn't worth adding yet.
- Avoid bringing it back when a user creates more accounts later.

## Related

- (no upstream dependencies — standalone UI cleanup)
