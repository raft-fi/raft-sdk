export enum CollateralTokenType {
  WSTETH,
}

export const COLLATERAL_TOKENS = ['ETH', 'stETH', 'wstETH'] as const;
export const R_TOKEN = 'R';

export const TOKENS = [...COLLATERAL_TOKENS, R_TOKEN] as const;

export type CollateralToken = (typeof COLLATERAL_TOKENS)[number];
export type RToken = typeof R_TOKEN;
export type Token = CollateralToken | RToken;
