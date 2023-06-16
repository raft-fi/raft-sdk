import { ZeroAddress } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { NetworkConfig, TokenConfig, UnderlyingCollateralTokenConfig } from './types';
import { getWstEthToStEthRate } from './rates';
import { Token, UnderlyingCollateralToken } from '../types';

const underlyingTokensConfig: Record<UnderlyingCollateralToken, UnderlyingCollateralTokenConfig> = {
  wstETH: {
    address: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0',
    supportedCollateralTokens: {
      ETH: {
        address: ZeroAddress,
        positionManager: '0x839d6833cee34ffab6fa9057b39f02bd3091a1d6',
        underlyingCollateralRate: getWstEthToStEthRate,
        underlyingTokenTicker: 'wstETH',
      },
      stETH: {
        address: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
        positionManager: '0x839d6833cee34ffab6fa9057b39f02bd3091a1d6',
        underlyingCollateralRate: getWstEthToStEthRate,
        underlyingTokenTicker: 'wstETH',
      },
      wstETH: {
        address: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0',
        positionManager: '0x5f59b322eb3e16a0c78846195af1f588b77403fc',
        underlyingCollateralRate: Decimal.ONE,
        underlyingTokenTicker: 'wstETH',
      },
      WETH: null,
    },
  },
  WETH: {
    address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    supportedCollateralTokens: {
      ETH: {
        address: ZeroAddress,
        positionManager: '', // wait for PositionManagerWETH deployment
        underlyingCollateralRate: Decimal.ONE,
        underlyingTokenTicker: 'WETH',
      },
      WETH: {
        address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        positionManager: '0x5f59b322eb3e16a0c78846195af1f588b77403fc',
        underlyingCollateralRate: Decimal.ONE,
        underlyingTokenTicker: 'WETH',
      },
      stETH: null,
      wstETH: null,
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
  WETH: {
    address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    hardcodedPrice: null,
    priceFeedTicker: 'WETH',
    subgraphPriceDataTicker: null,
    supportsPermit: false,
    ticker: 'WETH',
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
  positionManager: '0x5f59b322eb3e16a0c78846195af1f588b77403fc',
  positionManagerStEth: '0x839d6833cee34ffab6fa9057b39f02bd3091a1d6',
  raftCollateralTokens: {
    wstETH: '0xa7820009f79687d39f51909a01e7fd4b4d0663f8',
    WETH: '', // Add address once deployed
  },
  raftDebtTokens: {
    wstETH: '0x1C1D49D8F601f19D2Fa88b14BEf491759aaaF5d8',
    WETH: '', // Add address once deployed
  },
  priceFeeds: {
    wstETH: '0xDB5De0A34b29fFDeEc61E2D8ab4dB63f6641C730',
    WETH: '', // Add address once deployed
  },
  underlyingTokens: underlyingTokensConfig,
  tokens: tokensConfig,
  testNetwork: false,
};
