# Add Bank Account button on the COA page

**Audit priority:** Medium (UX + workflow)
**Section:** Chart of Accounts — UI

## What the auditor saw

Xero exposes an **+ Add Bank Account** button directly on the Chart of Accounts toolbar (alongside Add Account, Print PDF, Import, Export). WAWPROFI has no equivalent — bank accounts must be added from a separate Banking page.

## The auditor's reasoning

> Having an 'Add Bank Account' button directly in the Chart of Accounts is a huge timesaver. It turns a simple list of categories into a live connection with your real-world money … keeping it on this page means users don't have to jump back and forth between menus just to get set up.

## What to do

- Add an **+ Add Bank Account** button next to **+ Add Account** on the COA page.
- The button opens the same modal used in the Banking tab.
- On success, the new bank account appears in the COA list immediately (it should be a `ChartAccount` row with `reportCategory = BANK`).

## Implementation notes

- Depends on [bank account add actually working](bank-account-sync-broken.md). Fix that first.
- Depends on the architectural decision in [docs/missing/data-models/bank-models.md](../../missing/data-models/bank-models.md): does adding a bank account create a Prisma `ChartAccount` only, or does it also register a feed in Django?
- Whatever path is chosen, the COA list must show the bank account after creation.

## Related

- [Bank account sync broken](bank-account-sync-broken.md) — prerequisite.
- [Missing — Bank models](../../missing/data-models/bank-models.md).
