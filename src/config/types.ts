import { UnderlyingCollateralToken } from '../types';

export type SupportedNetwork = 'goerli' | 'mainnet';

type TickerToAddressMap = {
  [tokenTicker in UnderlyingCollateralToken]: string;
};

export interface NetworkConfig {
  wstEth: string;
  stEth: string;
  r: string;
  raftCollateralTokens: TickerToAddressMap;
  raftDebtToken: string;
  positionManager: string;
  positionManagerStEth: string;
  priceFeeds: TickerToAddressMap;
  testNetwork: boolean;
}
