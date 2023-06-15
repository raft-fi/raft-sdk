import { Token, UnderlyingCollateralToken } from '../types';

export type SupportedNetwork = 'goerli' | 'mainnet';

type UnderlyingTokenTickerToAddressMap = {
  [tokenTicker in UnderlyingCollateralToken]: string;
};

type TokenConfig = {
  address: string;
  ticker: Token;
  supportsPermit: boolean;
  positionManager: string;
};

export type TokenTickerToTokenConfigMap = {
  [tokenTicker in Token]: TokenConfig;
};

export type TokenAddressToTokenConfigMap = {
  [tokenAddress: string]: TokenConfig;
};

export interface NetworkConfig {
  raftCollateralTokens: UnderlyingTokenTickerToAddressMap;
  raftDebtToken: string;
  positionManager: string;
  positionManagerStEth: string;
  priceFeeds: UnderlyingTokenTickerToAddressMap;
  tokenAddressToTokenConfigMap: TokenAddressToTokenConfigMap;
  tokenTickerToTokenConfigMap: TokenTickerToTokenConfigMap;
  testNetwork: boolean;
}
