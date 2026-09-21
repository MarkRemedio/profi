# Exchange rates / FX revaluation

**Status:** Partial
**Category:** Data model

## What this is

A daily FX rate feed and the periodic revaluation journal that adjusts foreign-currency balances back to the base currency.

## Current state

- `Organization.multicurrencyEnabled` flag exists ([prisma/schema.prisma:103](../../../prisma/schema.prisma#L103)).
- `CurrencyCode` enum supports GBP/USD/EUR only ([prisma/schema.prisma:90](../../../prisma/schema.prisma#L90)).
- No `ExchangeRate` table, no rate provider integration, no revaluation logic.

## Why it's needed

- Without rates, multi-currency invoices can't post in base currency.
- Year-end requires revaluing AR/AP balances at the closing rate (gain/loss to P&L).

## Recommended approach

```prisma
model ExchangeRate {
  id          String
  date        Date
  from        CurrencyCode
  to          CurrencyCode
  rate        Decimal  @db.Decimal(20, 10)
  source      String   // 'ecb' | 'manual' | 'openexchangerates'
  @@unique([date, from, to])
}
```

- Daily job pulls ECB rates (free, EUR-base) and derives cross-rates.
- Period-end revaluation: walk AR/AP per currency, compute delta vs. closing rate, post `DR/CR FX gain/loss`.

## Implementation notes

- Replace `CurrencyCode` enum with `String` (ISO 4217) or expand the enum to all currencies you support.
- Store the rate used _on each line_ of a foreign invoice (don't recompute later).

## Related

- [Background jobs](../architecture/background-jobs.md), [Reporting periods](reporting-periods.md), [Bank models](bank-models.md)
