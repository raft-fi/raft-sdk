export enum CollateralTokenType {
  WSTETH,
}

export const COLLATERAL_TOKENS = ['ETH', 'stETH', 'wstETH'] as const;
export const RAFT_TOKEN = 'R';

export const TOKENS = [...COLLATERAL_TOKENS, RAFT_TOKEN] as const;

export type CollateralToken = (typeof COLLATERAL_TOKENS)[number];
export type RaftToken = typeof RAFT_TOKEN;
export type Token = CollateralToken | RaftToken;
