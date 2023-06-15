import { Decimal } from '@tempusfinance/decimal';

export const UNDERLYING_COLLATERAL_TOKENS = ['wstETH', 'WETH'] as const;
export const COLLATERAL_TOKENS = ['ETH', 'stETH', ...UNDERLYING_COLLATERAL_TOKENS] as const;
export const R_TOKEN = 'R';
export const TOKENS = [...COLLATERAL_TOKENS, R_TOKEN] as const;

export type UnderlyingCollateralToken = (typeof UNDERLYING_COLLATERAL_TOKENS)[number];
export type CollateralToken = (typeof COLLATERAL_TOKENS)[number];
export type RToken = typeof R_TOKEN;
export type Token = CollateralToken | RToken;

/**
 * @param maxFeePercentage Maximum fee percentage to pay for transaction.
 * @param gasLimitMultiplier Multiplier to apply to estimated gas cost.
 */
export interface TransactionWithFeesOptions {
  maxFeePercentage?: Decimal;
  gasLimitMultiplier?: Decimal;
}
