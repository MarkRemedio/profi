/**
 * UK tax rates and thresholds.
 *
 * Deliberately a plain table of published figures with the tax year they belong
 * to, rather than numbers scattered through the code. Rates change every April
 * and a stale one produces a confident, wrong estimate.
 *
 * Everything is in minor units — pence — to match the ledger.
 *
 * These are estimates from the books as they stand. A real liability depends on
 * disallowable expenses, capital allowances, reliefs and losses brought
 * forward, none of which the product records. Anything showing a figure from
 * here has to say so.
 */

const POUND = 100;

/* -------------------------------------------------------------------------- */
/* Corporation tax                                                            */
/* -------------------------------------------------------------------------- */

/** Financial year 2023 onwards — the rates in force since 1 April 2023. */
export const CORPORATION_TAX = {
  label: "FY2023 onwards",
  smallProfitsRate: 0.19,
  mainRate: 0.25,
  lowerLimitMinor: 50_000 * POUND,
  upperLimitMinor: 250_000 * POUND,
  /** Marginal relief fraction: 3/200. */
  marginalReliefFraction: 3 / 200,
} as const;

export type CorporationTaxEstimate = {
  taxableProfitMinor: number;
  taxMinor: number;
  /** "19% small profits rate", "25% main rate", "Marginal relief". */
  basis: string;
  effectiveRate: number;
};

/**
 * Corporation tax on a period's profit.
 *
 * Below £50,000 it is a flat 19%; above £250,000 a flat 25%. Between the two,
 * marginal relief tapers one into the other: 25% of the profit less 3/200 of
 * the distance to the upper limit. At exactly £50,000 that comes to £9,500,
 * which is 19% — the two rates meet, as they are meant to.
 *
 * The limits are divided between associated companies and pro-rated for periods
 * shorter than a year. Neither is recorded, so this assumes one company and a
 * full twelve months.
 */
export function estimateCorporationTax(profitMinor: number): CorporationTaxEstimate {
  const profit = Math.max(0, Math.round(profitMinor));

  if (profit === 0) {
    return { taxableProfitMinor: 0, taxMinor: 0, basis: "No taxable profit", effectiveRate: 0 };
  }

  if (profit <= CORPORATION_TAX.lowerLimitMinor) {
    const tax = Math.round(profit * CORPORATION_TAX.smallProfitsRate);
    return {
      taxableProfitMinor: profit,
      taxMinor: tax,
      basis: "19% small profits rate",
      effectiveRate: CORPORATION_TAX.smallProfitsRate,
    };
  }

  if (profit >= CORPORATION_TAX.upperLimitMinor) {
    const tax = Math.round(profit * CORPORATION_TAX.mainRate);
    return {
      taxableProfitMinor: profit,
      taxMinor: tax,
      basis: "25% main rate",
      effectiveRate: CORPORATION_TAX.mainRate,
    };
  }

  const relief =
    CORPORATION_TAX.marginalReliefFraction * (CORPORATION_TAX.upperLimitMinor - profit);
  const tax = Math.round(profit * CORPORATION_TAX.mainRate - relief);

  return {
    taxableProfitMinor: profit,
    taxMinor: tax,
    basis: "25% main rate with marginal relief",
    effectiveRate: tax / profit,
  };
}

/* -------------------------------------------------------------------------- */
/* Income tax and National Insurance for the self-employed                    */
/* -------------------------------------------------------------------------- */

/**
 * England, Wales and Northern Ireland, 2025/26.
 *
 * Scotland sets its own income tax bands. Nothing records where a business
 * trades from, so Scottish taxpayers will see an estimate against the rUK
 * bands — which the page says.
 */
export const INCOME_TAX = {
  label: "2025/26 (England, Wales & NI)",
  personalAllowanceMinor: 12_570 * POUND,
  /** The allowance drops by £1 for every £2 of income over this. */
  allowanceTaperFromMinor: 100_000 * POUND,
  basicRate: 0.2,
  basicBandMinor: 37_700 * POUND,
  higherRate: 0.4,
  higherBandTopMinor: 125_140 * POUND,
  additionalRate: 0.45,
} as const;

/** Class 4 National Insurance, 2025/26. */
export const CLASS_4_NI = {
  lowerProfitsLimitMinor: 12_570 * POUND,
  upperProfitsLimitMinor: 50_270 * POUND,
  mainRate: 0.06,
  upperRate: 0.02,
} as const;

export type SelfAssessmentEstimate = {
  profitMinor: number;
  personalAllowanceMinor: number;
  incomeTaxMinor: number;
  class4NiMinor: number;
  totalMinor: number;
  effectiveRate: number;
};

/**
 * Income tax and Class 4 NI on self-employed profit.
 *
 * Treats the profit as the person's only income, which is what the books can
 * see. A salary, rental income or dividends elsewhere would push them into
 * higher bands, so this is a floor rather than a forecast.
 */
export function estimateSelfAssessment(profitMinor: number): SelfAssessmentEstimate {
  const profit = Math.max(0, Math.round(profitMinor));

  // The personal allowance is withdrawn by £1 for every £2 above £100,000, so
  // it is gone entirely by £125,140.
  const taper = Math.max(0, profit - INCOME_TAX.allowanceTaperFromMinor);
  const allowance = Math.max(0, INCOME_TAX.personalAllowanceMinor - Math.floor(taper / 2));

  const taxable = Math.max(0, profit - allowance);

  const basic = Math.min(taxable, INCOME_TAX.basicBandMinor);
  // The higher-rate band runs from the end of the basic band up to £125,140 of
  // total income, so its width depends on the allowance actually given.
  const higherBandWidth = Math.max(
    0,
    INCOME_TAX.higherBandTopMinor - allowance - INCOME_TAX.basicBandMinor
  );
  const higher = Math.min(Math.max(0, taxable - basic), higherBandWidth);
  const additional = Math.max(0, taxable - basic - higher);

  const incomeTax = Math.round(
    basic * INCOME_TAX.basicRate +
      higher * INCOME_TAX.higherRate +
      additional * INCOME_TAX.additionalRate
  );

  const niMain =
    Math.max(
      0,
      Math.min(profit, CLASS_4_NI.upperProfitsLimitMinor) - CLASS_4_NI.lowerProfitsLimitMinor
    ) * CLASS_4_NI.mainRate;
  const niUpper =
    Math.max(0, profit - CLASS_4_NI.upperProfitsLimitMinor) * CLASS_4_NI.upperRate;
  const class4Ni = Math.round(niMain + niUpper);

  const total = incomeTax + class4Ni;

  return {
    profitMinor: profit,
    personalAllowanceMinor: allowance,
    incomeTaxMinor: incomeTax,
    class4NiMinor: class4Ni,
    totalMinor: total,
    effectiveRate: profit > 0 ? total / profit : 0,
  };
}
