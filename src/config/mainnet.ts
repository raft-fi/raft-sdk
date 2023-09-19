import { Decimal } from '@tempusfinance/decimal';
import { NetworkConfig, TokenConfig, UnderlyingTokens } from './types';
import { Token } from '../types';
import { getWstEthToStEthRate } from '../price';

const POSITION_MANAGER_ADDRESS = '0x5f59b322eb3e16a0c78846195af1f588b77403fc';
const POSITION_MANAGER_STETH_ADDRESS = '0x839d6833cee34ffab6fa9057b39f02bd3091a1d6';
const POSITION_MANAGER_WRAPPED_RETH_ADDRESS = '0x29f8abb4cab4bbb56f617d9a3c0f62d33758e74e';
const INTEREST_RATE_POSITION_MANAGER_ADDRESS = '0x9AB6b21cDF116f611110b048987E58894786C244';
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
  'wcrETH-v1': {
    supportedCollateralTokens: {
      'rETH-v1': {
        positionManager: POSITION_MANAGER_WRAPPED_RETH_ADDRESS,
      },
      'wcrETH-v1': {
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
  rETH: {
    supportedCollateralTokens: {
      rETH: {
        positionManager: INTEREST_RATE_POSITION_MANAGER_ADDRESS,
      },
    },
  },
  WBTC: {
    supportedCollateralTokens: {
      WBTC: {
        positionManager: INTEREST_RATE_POSITION_MANAGER_ADDRESS,
      },
    },
  },
  cbETH: {
    supportedCollateralTokens: {
      cbETH: {
        positionManager: INTEREST_RATE_POSITION_MANAGER_ADDRESS,
      },
    },
  },
  swETH: {
    supportedCollateralTokens: {
      swETH: {
        positionManager: INTEREST_RATE_POSITION_MANAGER_ADDRESS,
      },
    },
  },
};

const tokensConfig: Record<Token, TokenConfig> = {
  stETH: {
    address: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
    ticker: 'stETH',
    decimals: 18,
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
    decimals: 18,
    supportsPermit: true,
    priceFeed: 'wstETH',
  },
  'wstETH-v1': {
    address: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0',
    ticker: 'wstETH',
    decimals: 18,
    supportsPermit: true,
    priceFeed: 'wstETH',
  },
  rETH: {
    address: '0xae78736cd615f374d3085123a210448e74fc6393',
    ticker: 'rETH',
    decimals: 18,
    supportsPermit: false,
    priceFeed: 'wcrETH-v1',
  },
  'rETH-v1': {
    address: '0xae78736cd615f374d3085123a210448e74fc6393',
    ticker: 'rETH',
    decimals: 18,
    supportsPermit: false,
    priceFeed: 'wcrETH-v1',
  },
  'wcrETH-v1': {
    address: '0xb69e35fb4a157028b92f42655090b984609ae598',
    ticker: 'wcrETH-v1',
    decimals: 18,
    supportsPermit: true,
    priceFeed: 'wcrETH-v1',
  },
  WETH: {
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    ticker: 'WETH',
    decimals: 18,
    supportsPermit: false,
    priceFeed: 'WETH',
  },
  WBTC: {
    address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    ticker: 'WBTC',
    decimals: 8,
    supportsPermit: false,
    priceFeed: 'WBTC',
  },
  cbETH: {
    address: '0xBe9895146f7AF43049ca1c1AE358B0541Ea49704',
    ticker: 'cbETH',
    decimals: 18,
    supportsPermit: false,
    priceFeed: 'cbETH',
  },
  swETH: {
    address: '0xf951E335afb289353dc249e82926178EaC7DEd78',
    ticker: 'swETH',
    decimals: 18,
    supportsPermit: false,
    priceFeed: 'swETH',
  },
  R: {
    address: '0x183015a9ba6ff60230fdeadc3f43b3d788b13e21',
    ticker: 'R',
    decimals: 18,
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
    'wcrETH-v1': POSITION_MANAGER_WRAPPED_RETH_ADDRESS,
  },
  raftCollateralTokens: {
    'wstETH-v1': '0xa7820009f79687d39f51909a01e7fd4b4d0663f8',
    'wcrETH-v1': '0xc38a040faC5769bDed5dDa8Dea1aef609e755363',
    wstETH: '0x2c97108e22B93d636eea3697C53BaE8dcd91eCFA',
    WETH: '0x282a582cdcb46218eaf023ad90e9ef619c3e8a2f',
    rETH: '0x4D52A8ED75723d189a6592807F391baC279B9D61',
    WBTC: '0x7A0062b654ca2B492C86A0548E6e7e2C7B63126A',
    cbETH: '0xD0Db31473CaAd65428ba301D2174390d11D0C788',
    swETH: '0x21Cf10Ff341c488Bd29a129a969753dF98A65850',
  },
  raftDebtTokens: {
    'wstETH-v1': '0x1C1D49D8F601f19D2Fa88b14BEf491759aaaF5d8',
    'wcrETH-v1': '0xF22Cd22B5Cf439825C6B75c816A4daf8fB44375B',
    wstETH: '0x56f8c39A29179a0B83e2D591e688bc1B57D964Bf',
    WETH: '0x84E1EbC1E9dA835998c60D261109D63Be71ab682',
    rETH: '0x1b3538F79a0e0fAE0091855d958591f6F43A7387',
    WBTC: '0x1DB8C0fdC9515A6f4dF0BEF7f6b85eff91dF5f94',
    cbETH: '0x7beBe1D451291099D8e05fA2676412c09C96dFbC',
    swETH: '0x57a526a87e84cea64aa6914cfbB450c69c77174C',
  },
  priceFeeds: {
    'wstETH-v1': '0xDB5De0A34b29fFDeEc61E2D8ab4dB63f6641C730',
    'wcrETH-v1': '0x62ac8d1ebf61636e17d92ec3b24e8e03fb853cda',
    wstETH: '0xDB5De0A34b29fFDeEc61E2D8ab4dB63f6641C730',
    WETH: '0xE66bC214beef3D61Ce66dA9f80E67E14413bfc5A',
    rETH: '0x62ac8d1ebf61636e17d92ec3b24e8e03fb853cda',
    WBTC: '0xf65916E410A87953AE075AD7AB7bdE695Ae14D27',
    cbETH: '0x3cd40D6e8426C9f02Fe7B23867661377E462df3d',
    swETH: '0x2bAE40A96D4aD0150f48E2174CfCDf2BD4f0B39C',
  },
  underlyingTokens: underlyingTokensConfig,
  tokens: tokensConfig,
  daiAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  testNetwork: false,
  rSavingsModule: '0x2ba26bae6df1153e29813d7f926143f9c94402f3',
};
