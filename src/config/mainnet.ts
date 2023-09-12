import { Decimal } from '@tempusfinance/decimal';
import { NetworkConfig, TokenConfig, UnderlyingTokens } from './types';
import { Token } from '../types';
import { getWstEthToStEthRate } from '../price';

const POSITION_MANAGER_ADDRESS = '0x5f59b322eb3e16a0c78846195af1f588b77403fc';
const POSITION_MANAGER_STETH_ADDRESS = '0x839d6833cee34ffab6fa9057b39f02bd3091a1d6';
const POSITION_MANAGER_WRAPPED_RETH_ADDRESS = '0x29f8abb4cab4bbb56f617d9a3c0f62d33758e74e';
const INTEREST_RATE_POSITION_MANAGER_ADDRESS = ''; // TODO: use interest rate position manager
const ONE_INCH_ONE_STEP_LEVERAGE_STETH_ADDRESS = '0xB2Bf4De5a63B2225338CdFdBAd045EA62f158b67';

const underlyingTokensConfig: UnderlyingTokens = {
  'wstETH-v1': {
    supportedCollateralTokens: {
      stETH: {
        positionManager: POSITION_MANAGER_STETH_ADDRESS,
      },
      'wstETH-v1': {
        positionManager: POSITION_MANAGER_ADDRESS,
      },
    },
  },
  wcrETH: {
    supportedCollateralTokens: {
      rETH: {
        positionManager: POSITION_MANAGER_WRAPPED_RETH_ADDRESS,
      },
      wcrETH: {
        positionManager: POSITION_MANAGER_ADDRESS,
      },
    },
  },
  wstETH: {
    supportedCollateralTokens: {
      wstETH: {
        positionManager: INTEREST_RATE_POSITION_MANAGER_ADDRESS,
      },
    },
  },
  WETH: {
    supportedCollateralTokens: {
      WETH: {
        positionManager: INTEREST_RATE_POSITION_MANAGER_ADDRESS,
      },
    },
  },
};

const tokensConfig: Record<Token, TokenConfig> = {
  stETH: {
    address: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
    ticker: 'stETH',
    supportsPermit: false,
    priceFeed: {
      ticker: 'stETH',
      fallbackToken: 'wstETH',
      getFallbackRate: getWstEthToStEthRate,
    },
  },
  wstETH: {
    address: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0',
    ticker: 'wstETH',
    supportsPermit: true,
    priceFeed: 'wstETH',
  },
  'wstETH-v1': {
    address: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0',
    ticker: 'wstETH',
    supportsPermit: true,
    priceFeed: 'wstETH',
  },
  rETH: {
    address: '0xae78736cd615f374d3085123a210448e74fc6393',
    ticker: 'rETH',
    supportsPermit: false,
    priceFeed: 'wcrETH',
  },
  wcrETH: {
    address: '0xb69e35fb4a157028b92f42655090b984609ae598',
    ticker: 'wcrETH',
    supportsPermit: true,
    priceFeed: 'wcrETH',
  },
  WETH: {
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    ticker: 'WETH',
    supportsPermit: false,
    priceFeed: 'WETH',
  },
  R: {
    address: '0x183015a9ba6ff60230fdeadc3f43b3d788b13e21',
    ticker: 'R',
    supportsPermit: true,
    priceFeed: Decimal.ONE,
  },
};

export const mainnetConfig: NetworkConfig = {
  positionManager: POSITION_MANAGER_ADDRESS,
  positionManagerStEth: POSITION_MANAGER_STETH_ADDRESS,
  interestRatePositionManager: INTEREST_RATE_POSITION_MANAGER_ADDRESS,
  oneInchOneStepLeverageStEth: ONE_INCH_ONE_STEP_LEVERAGE_STETH_ADDRESS,
  wrappedCollateralTokenPositionManagers: {
    wcrETH: POSITION_MANAGER_WRAPPED_RETH_ADDRESS,
  },
  raftCollateralTokens: {
    'wstETH-v1': '0xa7820009f79687d39f51909a01e7fd4b4d0663f8',
    wcrETH: '0xc38a040faC5769bDed5dDa8Dea1aef609e755363',
    wstETH: '0xa7820009f79687d39f51909a01e7fd4b4d0663f8', // TODO: add wstETH v2 collateral token
    WETH: '0xc38a040faC5769bDed5dDa8Dea1aef609e755363', // TODO: add WETH collateral token
  },
  raftDebtTokens: {
    'wstETH-v1': '0x1C1D49D8F601f19D2Fa88b14BEf491759aaaF5d8',
    wcrETH: '0xF22Cd22B5Cf439825C6B75c816A4daf8fB44375B',
    wstETH: '0x1C1D49D8F601f19D2Fa88b14BEf491759aaaF5d8', // TODO: add wstETH v2 debt token
    WETH: '0xF22Cd22B5Cf439825C6B75c816A4daf8fB44375B', // TODO: add WETH debt token
  },
  priceFeeds: {
    'wstETH-v1': '0xDB5De0A34b29fFDeEc61E2D8ab4dB63f6641C730',
    wcrETH: '0x62ac8d1ebf61636e17d92ec3b24e8e03fb853cda',
    wstETH: '0xDB5De0A34b29fFDeEc61E2D8ab4dB63f6641C730',
    WETH: '0x62ac8d1ebf61636e17d92ec3b24e8e03fb853cda', // TODO: add WETH price feed
  },
  underlyingTokens: underlyingTokensConfig,
  tokens: tokensConfig,
  daiAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  testNetwork: false,
  rSavingsModule: '0x2ba26bae6df1153e29813d7f926143f9c94402f3',
};
