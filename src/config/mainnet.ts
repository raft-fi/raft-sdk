import { ZeroAddress } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import PositionManagerABI from '../abi/PositionManager.json';
import PositionManagerStEthABI from '../abi/PositionManagerStETH.json';
import { NetworkConfig, TokenTickerToTokenConfigMap } from './types';
import { getWstEthToStEthRate } from './rates';

const tokenTickerToTokenConfigMap: TokenTickerToTokenConfigMap = {
  WETH: {
    address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    positionManager: '0x5f59b322eb3e16a0c78846195af1f588b77403fc',
    positionManagerABI: JSON.stringify(PositionManagerABI),
    positionMangerManageFunc: 'managePosition',
    ticker: 'WETH',
    supportsPermit: false,
    priceFeedTicker: 'WETH',
    hardcodedPrice: null,
    underlyingTokenTicker: 'WETH',
    underlyingCollateralRate: Decimal.ONE,
  },
  ETH: {
    address: ZeroAddress,
    positionManager: '', // waiting for delegate deployment
    positionManagerABI: '', // add ABI once contract is deployed and verified
    positionMangerManageFunc: '', // add once contract is deployed and function name is confirmed
    ticker: 'ETH',
    supportsPermit: false,
    priceFeedTicker: null,
    hardcodedPrice: null,
    underlyingTokenTicker: 'WETH',
    underlyingCollateralRate: Decimal.ONE,
  },
  wstETH: {
    address: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0',
    positionManager: '0x5f59b322eb3e16a0c78846195af1f588b77403fc',
    positionManagerABI: JSON.stringify(PositionManagerABI),
    positionMangerManageFunc: 'managePosition',
    ticker: 'wstETH',
    supportsPermit: true,
    priceFeedTicker: 'wstETH',
    hardcodedPrice: null,
    underlyingTokenTicker: 'wstETH',
    underlyingCollateralRate: Decimal.ONE,
  },
  stETH: {
    address: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
    positionManager: '0x839d6833cee34ffab6fa9057b39f02bd3091a1d6',
    positionManagerABI: JSON.stringify(PositionManagerStEthABI),
    positionMangerManageFunc: 'managePositionStETH',
    ticker: 'stETH',
    supportsPermit: false,
    priceFeedTicker: null,
    hardcodedPrice: null,
    underlyingTokenTicker: 'wstETH',
    underlyingCollateralRate: getWstEthToStEthRate,
  },
  R: {
    address: '0x183015a9ba6ff60230fdeadc3f43b3d788b13e21',
    positionManager: '0x5f59b322eb3e16a0c78846195af1f588b77403fc',
    positionManagerABI: JSON.stringify(PositionManagerABI),
    positionMangerManageFunc: 'managePosition',
    ticker: 'R',
    supportsPermit: true,
    priceFeedTicker: null,
    hardcodedPrice: Decimal.ONE,
    underlyingTokenTicker: null,
    underlyingCollateralRate: null,
  },
};

export const mainnetConfig: NetworkConfig = {
  raftCollateralTokens: {
    wstETH: '0xa7820009f79687d39f51909a01e7fd4b4d0663f8',
    WETH: '', // Add address once deployed
  },
  raftDebtTokens: {
    wstETH: '0x1C1D49D8F601f19D2Fa88b14BEf491759aaaF5d8',
    WETH: '', // Add address once deployed
  },
  positionManager: '0x5f59b322eb3e16a0c78846195af1f588b77403fc',
  positionManagerStEth: '0x839d6833cee34ffab6fa9057b39f02bd3091a1d6',
  priceFeeds: {
    wstETH: '0xDB5De0A34b29fFDeEc61E2D8ab4dB63f6641C730',
    WETH: '', // Add address once deployed
  },
  tokenTickerToTokenConfigMap,
  testNetwork: false,
};
