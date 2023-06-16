import { ZeroAddress } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { NetworkConfig, TokenConfig, UnderlyingCollateralTokenConfig } from './types';
import { getWstEthToStEthRate } from './rates';
import { Token, UnderlyingCollateralToken } from '../types';

const underlyingTokensConfig: Record<UnderlyingCollateralToken, UnderlyingCollateralTokenConfig> = {
  wstETH: {
    supportedCollateralTokens: {
      ETH: {
        positionManager: '0x4e01f8c03893be67b60af6a1b49d6e51a8781e3c',
        underlyingCollateralRate: getWstEthToStEthRate,
        underlyingTokenTicker: 'wstETH',
      },
      stETH: {
        positionManager: '0x4e01f8c03893be67b60af6a1b49d6e51a8781e3c',
        underlyingCollateralRate: getWstEthToStEthRate, // TODO - Use proper rate - do not assume that 1 stETH = 1 ETH
        underlyingTokenTicker: 'wstETH',
      },
      wstETH: {
        positionManager: '0xeaf8aad45d563f14d8b443277dd51c426ad8607f',
        underlyingCollateralRate: Decimal.ONE,
        underlyingTokenTicker: 'wstETH',
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
    subgraphPriceDataTicker: null,
    supportsPermit: false,
  },
  stETH: {
    address: '0x1643E812aE58766192Cf7D2Cf9567dF2C37e9B7F',
    hardcodedPrice: null,
    priceFeedTicker: null,
    subgraphPriceDataTicker: null,
    supportsPermit: false,
    ticker: 'stETH',
  },
  wstETH: {
    address: '0x6320cD32aA674d2898A68ec82e869385Fc5f7E2f',
    hardcodedPrice: null,
    priceFeedTicker: 'wstETH',
    subgraphPriceDataTicker: null,
    supportsPermit: true,
    ticker: 'wstETH',
  },

  R: {
    address: '0x9b41fE4EE4F23507953CCA339A4eC27eAc9e02b8',
    hardcodedPrice: Decimal.ONE,
    priceFeedTicker: null,
    subgraphPriceDataTicker: null,
    supportsPermit: true,
    ticker: 'R',
  },
};

export const goerliConfig: NetworkConfig = {
  positionManager: '0xeaf8aad45d563f14d8b443277dd51c426ad8607f',
  positionManagerStEth: '0x4e01f8c03893be67b60af6a1b49d6e51a8781e3c',
  raftCollateralTokens: {
    wstETH: '0x86695745Ce31FBd45Db7F6866d5d3Abe048ce033',
  },
  raftDebtTokens: {
    wstETH: '0xAABF1f5e5C9b559aaCD3c97B41B0B1ae593e31A8',
  },
  priceFeeds: {
    wstETH: '0x0341b185e55A0860D6a7e853fd44D1f4fe37dB37',
  },
  underlyingTokens: underlyingTokensConfig,
  tokens: tokensConfig,
  testNetwork: true,
};
