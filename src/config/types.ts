import { UnderlyingCollateralToken } from '../types';

export type SupportedNetwork = 'goerli' | 'mainnet';

type RaftCollateralTokenAddresses = {
  [tokenTicker in UnderlyingCollateralToken]: string;
};

export interface NetworkAddresses {
  wstEth: string;
  stEth: string;
  r: string;
  raftCollateralTokens: RaftCollateralTokenAddresses;
  raftDebtToken: string;
  positionManager: string;
  positionManagerStEth: string;
}
