import { Decimal } from '@tempusfinance/decimal';
import { Token, UnderlyingCollateralToken, WrappedCappedUnderlyingCollateralToken } from '../types';
import { ContractRunner } from 'ethers';

export type SupportedNetwork = 'goerli' | 'mainnet';
export type PositionManagerType = 'base' | 'stETH' | 'wrapped' | 'interest-rate';
export type SubgraphPriceFeedToken = 'ETH' | 'stETH';

export type SupportedCollateralTokens = {
  'wstETH-v1': 'stETH' | 'wstETH-v1';
  'wcrETH-v1': 'rETH-v1' | 'wcrETH-v1';
  wstETH: 'wstETH';
  WETH: 'WETH';
  rETH: 'rETH';
  WBTC: 'WBTC';
  swETH: 'swETH';
  cbETH: 'cbETH';
};

export type UnderlyingCollateralTokenConfig<U extends UnderlyingCollateralToken> = {
  supportedCollateralTokens: Record<U | SupportedCollateralTokens[U], CollateralTokenConfig>;
};

export type UnderlyingTokens = {
  [underlyingToken in UnderlyingCollateralToken]: UnderlyingCollateralTokenConfig<underlyingToken>;
};

export type CollateralTokenConfig = {
  positionManager: string;
};

/**
 * This type is used to define the price feed for a collateral token that is fetched from the subgraph.
 * In case the price fetching fails, the fallback token and fallback rate are used.
 * @property ticker Ticker of the collateral token for which the price feed is defined on the subgraph.
 * @property fallbackToken Ticker of the fallback token whose price is fetched from the blockchain.
 * @property fallbackRate Function that returns the fallback `ticker`-`fallbackToken` rate.
 */
export interface SubgraphPriceFeed {
  ticker: SubgraphPriceFeedToken;
  fallbackToken: UnderlyingCollateralToken;
  getFallbackRate: (runner: ContractRunner) => Promise<Decimal>;
}

export type TokenConfig = {
  address: string;
  ticker: Token;
  decimals: number;
  supportsPermit: boolean;
  priceFeed: Decimal | UnderlyingCollateralToken | SubgraphPriceFeed;
};

export interface NetworkConfig {
  positionManager: string;
  positionManagerStEth: string;
  interestRatePositionManager: string;
  oneInchOneStepLeverageStEth: string;
  wrappedCollateralTokenPositionManagers: Record<WrappedCappedUnderlyingCollateralToken, string>;
  raftCollateralTokens: Record<UnderlyingCollateralToken, string>;
  raftDebtTokens: Record<UnderlyingCollateralToken, string>;
  priceFeeds: Record<UnderlyingCollateralToken, string>;
  underlyingTokens: UnderlyingTokens;
  tokens: Record<Token, TokenConfig>;
  testNetwork: boolean;
  daiAddress: string;
  rSavingsModule: string;
  raftAirdropAddress: string;
  claimRaftStakeVeRaftAddress: string;
  // https://docs.balancer.fi/concepts/governance/veBAL/
  veRaftAddress: string;
  // 80/20 balancer weighted pool for RAFT/R
  balancerWeightedPoolId: string;
}
