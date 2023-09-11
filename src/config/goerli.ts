import { Decimal } from '@tempusfinance/decimal';
import { NetworkConfig, TokenConfig, UnderlyingTokens } from './types';
import { getWstEthToStEthRate } from '../price';
import { Token } from '../types';

const POSITION_MANAGER_ADDRESS = '0xeaf8aad45d563f14d8b443277dd51c426ad8607f';
const POSITION_MANAGER_STETH_ADDRESS = '0x4e01f8c03893be67b60af6a1b49d6e51a8781e3c';
const POSITION_MANAGER_WRAPPED_RETH_ADDRESS = '0x109a9dace6e89cc5ddffebe374e15f029f6b1440';
const INTEREST_RATE_POSITION_MANAGER_ADDRESS = '0x3d5a98c26d02cdc3bd459937b7c9ba52d86476c6';

const underlyingTokensConfig: UnderlyingTokens = {
  wstETH: {
    supportedCollateralTokens: {
      stETH: {
        positionManager: POSITION_MANAGER_STETH_ADDRESS,
      },
      wstETH: {
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
    address: '0x1643E812aE58766192Cf7D2Cf9567dF2C37e9B7F',
    ticker: 'stETH',
    supportsPermit: false,
    priceFeed: {
      ticker: 'stETH',
      fallbackToken: 'wstETH',
      getFallbackRate: getWstEthToStEthRate,
    },
  },
  wstETH: {
    address: '0x6320cD32aA674d2898A68ec82e869385Fc5f7E2f',
    ticker: 'wstETH',
    supportsPermit: true,
    priceFeed: 'wstETH',
  },
  rETH: {
    address: '0x0b26a03413aCca79eE539015f036B7dF79ddD1c5',
    ticker: 'rETH',
    supportsPermit: false,
    priceFeed: 'wcrETH',
  },
  wcrETH: {
    address: '0x27d7f9921933DfA737B1006E5EFb637cC4b21fc8',
    ticker: 'wcrETH',
    supportsPermit: true,
    priceFeed: 'wcrETH',
  },
  WETH: {
    address: '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6',
    ticker: 'WETH',
    supportsPermit: false,
    priceFeed: 'WETH',
  },
  R: {
    address: '0x9b41fE4EE4F23507953CCA339A4eC27eAc9e02b8',
    ticker: 'R',
    supportsPermit: true,
    priceFeed: Decimal.ONE,
  },
};

export const goerliConfig: NetworkConfig = {
  positionManager: POSITION_MANAGER_ADDRESS,
  positionManagerStEth: POSITION_MANAGER_STETH_ADDRESS,
  interestRatePositionManager: INTEREST_RATE_POSITION_MANAGER_ADDRESS,
  oneInchOneStepLeverageStEth: '', // Add address if we ever deploy one step leverage on goerli
  wrappedCollateralTokenPositionManagers: {
    wcrETH: POSITION_MANAGER_WRAPPED_RETH_ADDRESS,
  },
  raftCollateralTokens: {
    wstETH: '0x86695745Ce31FBd45Db7F6866d5d3Abe048ce033',
    wcrETH: '0x1678f15179dF5608786561A8d56E498449dF2f28',
    WETH: '0x23c0bD21b5633c6Ac7552c3aE6154149949e13Ef',
  },
  raftDebtTokens: {
    wstETH: '0xAABF1f5e5C9b559aaCD3c97B41B0B1ae593e31A8',
    wcrETH: '0xB9F64d21b776abCA4aD2d04846D65cB0d072925F',
    WETH: '0x056F4DC66e2758C8B821B4d3f6552F14a78B173E',
  },
  priceFeeds: {
    wstETH: '0x0341b185e55A0860D6a7e853fd44D1f4fe37dB37',
    wcrETH: '0xfd7970eE3eF2E717346016f439A691Ea3DFd71BA',
    WETH: '0x93Fc3ef17A627913f9aD6507E07f28736286134D',
  },
  underlyingTokens: underlyingTokensConfig,
  tokens: tokensConfig,
  daiAddress: '', // Add address if we ever deploy one step leverage on goerli
  testNetwork: true,
  rSavingsModule: '0xDeEae93bf4bdA40529Fe5769Dd817996e86eb4Dd',
};
