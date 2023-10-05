import { Decimal } from '@tempusfinance/decimal';
import { NetworkConfig, TokenConfig, UnderlyingTokens } from './types';
import { getRRToRRate, getWstEthToStEthRate } from '../price';
import { Token } from '../types';

const POSITION_MANAGER_ADDRESS = '0xeaf8aad45d563f14d8b443277dd51c426ad8607f';
const POSITION_MANAGER_STETH_ADDRESS = '0x4e01f8c03893be67b60af6a1b49d6e51a8781e3c';
const POSITION_MANAGER_WRAPPED_RETH_ADDRESS = '0x109a9dace6e89cc5ddffebe374e15f029f6b1440';
const INTEREST_RATE_POSITION_MANAGER_ADDRESS = '0x7B07fC0C5829FC8c74cC18dF99C50b7d7fe830b4';

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
    address: '0x1643E812aE58766192Cf7D2Cf9567dF2C37e9B7F',
    ticker: 'stETH',
    decimals: 18,
    supportsPermit: false,
    priceFeed: {
      subgraphTokenTicker: 'stETH',
      fallbackToken: 'wstETH',
      getFallbackRate: getWstEthToStEthRate,
    },
  },
  wstETH: {
    address: '0x6320cD32aA674d2898A68ec82e869385Fc5f7E2f',
    ticker: 'wstETH',
    decimals: 18,
    supportsPermit: true,
    priceFeed: 'wstETH',
  },
  'wstETH-v1': {
    address: '0x6320cD32aA674d2898A68ec82e869385Fc5f7E2f',
    ticker: 'wstETH',
    decimals: 18,
    supportsPermit: true,
    priceFeed: 'wstETH-v1',
  },
  rETH: {
    address: '0x0b26a03413aCca79eE539015f036B7dF79ddD1c5',
    ticker: 'rETH',
    decimals: 18,
    supportsPermit: false,
    priceFeed: 'wcrETH-v1',
  },
  'rETH-v1': {
    address: '0x0b26a03413aCca79eE539015f036B7dF79ddD1c5',
    ticker: 'rETH',
    decimals: 18,
    supportsPermit: false,
    priceFeed: 'wcrETH-v1',
  },
  'wcrETH-v1': {
    address: '0x27d7f9921933DfA737B1006E5EFb637cC4b21fc8',
    ticker: 'wcrETH-v1',
    decimals: 18,
    supportsPermit: true,
    priceFeed: 'wcrETH-v1',
  },
  WETH: {
    address: '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6',
    ticker: 'WETH',
    decimals: 18,
    supportsPermit: false,
    priceFeed: 'WETH',
  },
  WBTC: {
    address: '', // TODO - Add address once this collateral is supported on goerli
    ticker: 'WBTC',
    decimals: 8,
    supportsPermit: false,
    priceFeed: 'WBTC',
  },
  cbETH: {
    address: '', // TODO - Add address once this collateral is supported on goerli
    ticker: 'cbETH',
    decimals: 18,
    supportsPermit: false,
    priceFeed: 'cbETH',
  },
  swETH: {
    address: '', // TODO - Add address once this collateral is supported on goerli
    ticker: 'swETH',
    decimals: 18,
    supportsPermit: false,
    priceFeed: 'swETH',
  },
  RAFT: {
    address: '0xfa8449189744799ad2ace7e0ebac8bb7575eff47', // TODO: update address
    ticker: 'RAFT',
    decimals: 18,
    supportsPermit: true,
    priceFeed: null,
  },
  veRAFT: {
    address: '0x0628fFBe2AE5A26F8C95F3de3Ddc957B3b87a27a', // TODO: update address
    ticker: 'veRAFT',
    decimals: 18,
    supportsPermit: false,
    priceFeed: null,
  },
  R: {
    address: '0x9b41fE4EE4F23507953CCA339A4eC27eAc9e02b8',
    ticker: 'R',
    decimals: 18,
    supportsPermit: true,
    priceFeed: Decimal.ONE,
  },
  RR: {
    address: '0xDeEae93bf4bdA40529Fe5769Dd817996e86eb4Dd',
    ticker: 'RR',
    decimals: 18,
    supportsPermit: false,
    priceFeed: {
      fallbackToken: 'R',
      getFallbackRate: getRRToRRate,
    },
  },
  'B-80RAFT-20R': {
    address: '0xf8a0623ab66f985effc1c69d05f1af4badb01b00', // TODO: update address
    ticker: 'B-80RAFT-20R',
    decimals: 18,
    supportsPermit: true,
    priceFeed: null,
  },
};

export const goerliConfig: NetworkConfig = {
  positionManager: POSITION_MANAGER_ADDRESS,
  positionManagerStEth: POSITION_MANAGER_STETH_ADDRESS,
  interestRatePositionManager: INTEREST_RATE_POSITION_MANAGER_ADDRESS,
  oneInchOneStepLeverageStEth: '', // Add address if we ever deploy one step leverage on goerli
  wrappedCollateralTokenPositionManagers: {
    'wcrETH-v1': POSITION_MANAGER_WRAPPED_RETH_ADDRESS,
  },
  raftCollateralTokens: {
    'wstETH-v1': '0x86695745Ce31FBd45Db7F6866d5d3Abe048ce033',
    'wcrETH-v1': '0x1678f15179dF5608786561A8d56E498449dF2f28',
    wstETH: '0xBF2b30825759EdC6eF771CC071af38DF8f321b9B',
    WETH: '', // TODO - Add address once deployed
    rETH: '', // TODO - Add address once deployed
    WBTC: '', // TODO - Add address once deployed
    cbETH: '', // TODO - Add address once deployed
    swETH: '', // TODO - Add address once deployed
  },
  raftDebtTokens: {
    'wstETH-v1': '0xAABF1f5e5C9b559aaCD3c97B41B0B1ae593e31A8',
    'wcrETH-v1': '0xB9F64d21b776abCA4aD2d04846D65cB0d072925F',
    wstETH: '0x7b485Fd7eDab0D354649Af4d73778FA26BE43369',
    WETH: '', // TODO - Add address once deployed
    rETH: '', // TODO - Add address once deployed
    WBTC: '', // TODO - Add address once deployed
    cbETH: '', // TODO - Add address once deployed
    swETH: '', // TODO - Add address once deployed
  },
  priceFeeds: {
    'wstETH-v1': '0x0341b185e55A0860D6a7e853fd44D1f4fe37dB37',
    'wcrETH-v1': '0xfd7970eE3eF2E717346016f439A691Ea3DFd71BA',
    wstETH: '0x93Fc3ef17A627913f9aD6507E07f28736286134D',
    WETH: '', // TODO - Add address once deployed
    rETH: '', // TODO - Add address once deployed
    WBTC: '', // TODO - Add address once deployed
    cbETH: '', // TODO - Add address once deployed
    swETH: '', // TODO - Add address once deployed
  },
  underlyingTokens: underlyingTokensConfig,
  tokens: tokensConfig,
  daiAddress: '', // Add address if we ever deploy one step leverage on goerli
  testNetwork: true,
  // deploy merkle-distributor everytime
  raftAirdropAddress: '0x5D12e548A216D8E73A32c9b73d5deA032d053cBd',
  claimRaftStakeVeRaftAddress: '0x061503C504dA3A1aD38742671a177f8b5f05c0D4',
  // this is veBAL/WETH pool
  balancerWeightedPoolId: '0xf8a0623ab66f985effc1c69d05f1af4badb01b00000200000000000000000060',
  feeDistributorAddress: '0x5D6986aCBfcC32A912Dc37861eA3a6e05D9CAF12',
};
