import { ZeroAddress } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import PositionManagerABI from '../abi/PositionManager.json';
import PositionManagerStEthABI from '../abi/PositionManagerStETH.json';
import { NetworkConfig, TokenTickerToTokenConfigMap } from './types';
import { getWstEthToStEthRate } from './rates';

const tokenTickerToTokenConfigMap: TokenTickerToTokenConfigMap = {
  WETH: {
    address: '0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6',
    positionManager: '0xeaf8aad45d563f14d8b443277dd51c426ad8607f',
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
    address: '0x6320cD32aA674d2898A68ec82e869385Fc5f7E2f',
    positionManager: '0xeaf8aad45d563f14d8b443277dd51c426ad8607f',
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
    address: '0x1643E812aE58766192Cf7D2Cf9567dF2C37e9B7F',
    positionManager: '0x4e01f8c03893be67b60af6a1b49d6e51a8781e3c',
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
    address: '0x9b41fE4EE4F23507953CCA339A4eC27eAc9e02b8',
    positionManager: '0xeaf8aad45d563f14d8b443277dd51c426ad8607f',
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

export const goerliConfig: NetworkConfig = {
  raftCollateralTokens: {
    wstETH: '0x86695745Ce31FBd45Db7F6866d5d3Abe048ce033',
    WETH: '', // Add address once deployed
  },
  raftDebtTokens: {
    wstETH: '0xAABF1f5e5C9b559aaCD3c97B41B0B1ae593e31A8',
    WETH: '', // Add address once deployed
  },
  positionManager: '0xeaf8aad45d563f14d8b443277dd51c426ad8607f',
  positionManagerStEth: '0x4e01f8c03893be67b60af6a1b49d6e51a8781e3c',
  priceFeeds: {
    wstETH: '0x0341b185e55A0860D6a7e853fd44D1f4fe37dB37',
    WETH: '', // Add address once deployed
  },
  tokenTickerToTokenConfigMap,
  testNetwork: true,
};
