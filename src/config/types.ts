import { Provider } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { CollateralToken, Token, UnderlyingCollateralToken } from '../types';

export type SupportedNetwork = 'goerli' | 'mainnet';

export type UnderlyingCollateralTokenConfig = {
  supportedCollateralTokens: Record<CollateralToken, CollateralTokenConfig | null>;
};

export type CollateralTokenConfig = {
  positionManager: string;
  underlyingTokenTicker: UnderlyingCollateralToken;
  underlyingCollateralRate: Decimal | ((address: string, provider: Provider) => Promise<Decimal>);
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
  raftCollateralTokens: Record<UnderlyingCollateralToken, string>;
  raftDebtTokens: Record<UnderlyingCollateralToken, string>;
  priceFeeds: Record<UnderlyingCollateralToken, string>;
  underlyingTokens: Record<UnderlyingCollateralToken, UnderlyingCollateralTokenConfig>;
  tokens: Record<Token, TokenConfig>;
  testNetwork: boolean;
}
