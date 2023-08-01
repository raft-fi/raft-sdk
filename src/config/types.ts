import { Provider } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { Token, UnderlyingCollateralToken, WrappedCappedUnderlyingCollateralToken } from '../types';

export type SupportedNetwork = 'goerli' | 'mainnet';
export type PositionManagerType = 'base' | 'stETH' | 'wrapped';

export type SupportedCollateralTokens = {
  wstETH: 'stETH' | 'wstETH';
  wcrETH: 'rETH' | 'wcrETH';
};

export type UnderlyingCollateralTokenConfig<U extends UnderlyingCollateralToken> = {
  supportedCollateralTokens: Record<U | SupportedCollateralTokens[U], CollateralTokenConfig>;
};

export type UnderlyingTokens = {
  [underlyingToken in UnderlyingCollateralToken]: UnderlyingCollateralTokenConfig<underlyingToken>;
};

export type CollateralTokenConfig = {
  positionManager: string;
  underlyingTokenTicker: UnderlyingCollateralToken;
  underlyingCollateralRate: Decimal | ((provider: Provider) => Promise<Decimal>);
};

export type TokenConfig = {
  address: string;
  ticker: Token;
  supportsPermit: boolean;
  priceFeedTicker: UnderlyingCollateralToken | null;
  hardcodedPrice: Decimal | null;
  subgraphPriceDataTicker: Token | null;
};

export interface NetworkConfig {
  positionManager: string;
  positionManagerStEth: string;
  oneInchOneStepLeverageStEth: string;
  wrappedCollateralTokenPositionManagers: Record<WrappedCappedUnderlyingCollateralToken, string>;
  raftCollateralTokens: Record<UnderlyingCollateralToken, string>;
  raftDebtTokens: Record<UnderlyingCollateralToken, string>;
  priceFeeds: Record<UnderlyingCollateralToken, string>;
  underlyingTokens: UnderlyingTokens;
  tokens: Record<Token, TokenConfig>;
  testNetwork: boolean;
  daiAddress: string;
  // https://docs.balancer.fi/concepts/governance/veBAL/
  veRaftAddress: string;
  // 80/20 balancer weighted pool for RAFT/R
  balancerWeightedPoolId: string;
}
