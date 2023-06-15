import { Provider } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { Token, UnderlyingCollateralToken } from '../types';

export type SupportedNetwork = 'goerli' | 'mainnet';

type UnderlyingTokenTickerToCollateralAddressMap = {
  [tokenTicker in UnderlyingCollateralToken]: string;
};

type UnderlyingTokenTickerToDebtAddressMap = {
  [tokenTicker in UnderlyingCollateralToken]: string;
};

type TokenConfig = {
  address: string;
  ticker: Token;
  supportsPermit: boolean;
  positionManager: string;
  positionManagerABI: string;
  positionMangerManageFunc: string;
  priceFeedTicker: UnderlyingCollateralToken | null;
  hardcodedPrice: Decimal | null;
  underlyingTokenTicker: UnderlyingCollateralToken | null;
  underlyingCollateralRate: Decimal | ((address: string, provider: Provider) => Promise<Decimal>) | null;
};

export type TokenTickerToTokenConfigMap = {
  [tokenTicker in Token]: TokenConfig;
};

export interface NetworkConfig {
  raftCollateralTokens: UnderlyingTokenTickerToCollateralAddressMap;
  raftDebtTokens: UnderlyingTokenTickerToDebtAddressMap;
  positionManager: string;
  positionManagerStEth: string;
  priceFeeds: UnderlyingTokenTickerToCollateralAddressMap;
  tokenTickerToTokenConfigMap: TokenTickerToTokenConfigMap;
  testNetwork: boolean;
}
