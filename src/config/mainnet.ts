import _ from 'lodash';
import { ZeroAddress } from 'ethers';
import { NetworkConfig, TokenAddressToTickerMap, TokenTickerToAddressMap } from './types';

/**
 * Make sure to use lower case addresses when adding new tokens
 */
const tokenTickerToAddressMap: TokenTickerToAddressMap = {
  WETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  ETH: ZeroAddress,
  wstETH: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0',
  stETH: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
  R: '0x183015a9ba6ff60230fdeadc3f43b3d788b13e21',
};

const tokenAddressToTickerMap = _.invert(tokenTickerToAddressMap) as TokenAddressToTickerMap;

const collateralToPositionManagerMap: TokenTickerToAddressMap = {
  ETH: '', // waiting for delegate deployment
  stETH: '0x839d6833cee34ffab6fa9057b39f02bd3091a1d6',
  R: '0x5f59b322eb3e16a0c78846195af1f588b77403fc',
  WETH: '0x5f59b322eb3e16a0c78846195af1f588b77403fc',
  wstETH: '0x5f59b322eb3e16a0c78846195af1f588b77403fc',
};

export const mainnetConfig: NetworkConfig = {
  raftCollateralTokens: {
    wstETH: '0xa7820009f79687d39f51909a01e7fd4b4d0663f8',
    WETH: '', // Add address once deployed
  },
  raftDebtToken: '0x1C1D49D8F601f19D2Fa88b14BEf491759aaaF5d8',
  positionManager: '0x5f59b322eb3e16a0c78846195af1f588b77403fc',
  positionManagerStEth: '0x839d6833cee34ffab6fa9057b39f02bd3091a1d6',
  priceFeeds: {
    wstETH: '0xDB5De0A34b29fFDeEc61E2D8ab4dB63f6641C730',
    WETH: '', // Add address once deployed
  },
  tokenTickerToAddressMap,
  tokenAddressToTickerMap,
  collateralToPositionManagerMap,
  testNetwork: false,
};
