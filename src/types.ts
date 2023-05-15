export const UNDERLYING_COLLATERAL_TOKENS = ['wstETH'] as const;
export const COLLATERAL_TOKENS = ['ETH', 'stETH', ...UNDERLYING_COLLATERAL_TOKENS] as const;
export const R_TOKEN = 'R';
export const TOKENS = [...COLLATERAL_TOKENS, R_TOKEN] as const;

export type UnderlyingCollateralToken = (typeof UNDERLYING_COLLATERAL_TOKENS)[number];
export type CollateralToken = (typeof COLLATERAL_TOKENS)[number];
export type RToken = typeof R_TOKEN;
export type Token = CollateralToken | RToken;
export type PriceQueryResponse = {
  id: CollateralToken;
  value: string;
  updatedAt: string;
};
