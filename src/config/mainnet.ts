import { ZeroAddress } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { NetworkConfig, TokenConfig, UnderlyingTokens } from './types';
import { getWstEthToStEthRate } from './rates';
import { Token } from '../types';

const POSITION_MANAGER_ADDRESS = '0x5f59b322eb3e16a0c78846195af1f588b77403fc';
const POSITION_MANAGER_STETH_ADDRESS = '0x839d6833cee34ffab6fa9057b39f02bd3091a1d6';
const POSITION_MANAGER_RETH = ''; // TODO: Add wrapped collateral token position manager

const underlyingTokensConfig: UnderlyingTokens = {
  wstETH: {
    supportedCollateralTokens: {
      ETH: {
        positionManager: POSITION_MANAGER_STETH_ADDRESS,
        underlyingCollateralRate: getWstEthToStEthRate,
        underlyingTokenTicker: 'wstETH',
      },
      stETH: {
        positionManager: POSITION_MANAGER_STETH_ADDRESS,
        underlyingCollateralRate: getWstEthToStEthRate,
        underlyingTokenTicker: 'wstETH',
      },
      wstETH: {
        positionManager: POSITION_MANAGER_ADDRESS,
        underlyingCollateralRate: Decimal.ONE,
        underlyingTokenTicker: 'wstETH',
      },
    },
  },
  wcrETH: {
    supportedCollateralTokens: {
      rETH: {
        positionManager: POSITION_MANAGER_RETH,
        underlyingCollateralRate: Decimal.ONE,
        underlyingTokenTicker: 'wcrETH',
      },
      wcrETH: {
        positionManager: POSITION_MANAGER_ADDRESS,
        underlyingCollateralRate: Decimal.ONE,
        underlyingTokenTicker: 'wcrETH',
      },
    },
  },
};

const tokensConfig: Record<Token, TokenConfig> = {
  ETH: {
    address: ZeroAddress,
    ticker: 'ETH',
    hardcodedPrice: null,
    priceFeedTicker: null,
    subgraphPriceDataTicker: 'ETH',
    supportsPermit: false,
  },
  stETH: {
    address: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
    hardcodedPrice: null,
    priceFeedTicker: null,
    subgraphPriceDataTicker: 'stETH',
    supportsPermit: false,
    ticker: 'stETH',
  },
  wstETH: {
    address: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0',
    hardcodedPrice: null,
    priceFeedTicker: 'wstETH',
    subgraphPriceDataTicker: null,
    supportsPermit: true,
    ticker: 'wstETH',
  },
  rETH: {
    address: '0xae78736cd615f374d3085123a210448e74fc6393',
    hardcodedPrice: null,
    priceFeedTicker: 'wcrETH',
    subgraphPriceDataTicker: null,
    supportsPermit: false,
    ticker: 'rETH',
  },
  wcrETH: {
    address: '', // TODO: Add wcrETH address
    hardcodedPrice: null,
    priceFeedTicker: 'wcrETH',
    subgraphPriceDataTicker: null,
    supportsPermit: true,
    ticker: 'wcrETH',
  },
  R: {
    address: '0x183015a9ba6ff60230fdeadc3f43b3d788b13e21',
    hardcodedPrice: Decimal.ONE,
    priceFeedTicker: null,
    subgraphPriceDataTicker: null,
    supportsPermit: true,
    ticker: 'R',
  },
};

export const mainnetConfig: NetworkConfig = {
  positionManager: POSITION_MANAGER_ADDRESS,
  positionManagerStEth: POSITION_MANAGER_STETH_ADDRESS,
  wrappedCollateralTokenPositionManagers: {
    wcrETH: POSITION_MANAGER_RETH,
  },
  raftCollateralTokens: {
    wstETH: '0xa7820009f79687d39f51909a01e7fd4b4d0663f8',
    wcrETH: '', // TODO: Add collateral token address
  },
  raftDebtTokens: {
    wstETH: '0x1C1D49D8F601f19D2Fa88b14BEf491759aaaF5d8',
    wcrETH: '', // TODO: Add token debt address
  },
  priceFeeds: {
    wstETH: '0xDB5De0A34b29fFDeEc61E2D8ab4dB63f6641C730',
    wcrETH: '', // TODO: Add price feed address
  },
  underlyingTokens: underlyingTokensConfig,
  tokens: tokensConfig,
  testNetwork: false,
};
