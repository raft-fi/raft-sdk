import { NetworkConfig } from './types';

export const goerliConfig: NetworkConfig = {
  wstEth: '0x6320cD32aA674d2898A68ec82e869385Fc5f7E2f',
  stEth: '0x1643E812aE58766192Cf7D2Cf9567dF2C37e9B7F',
  r: '0x9b41fE4EE4F23507953CCA339A4eC27eAc9e02b8',
  raftCollateralTokens: {
    wstETH: '0x86695745Ce31FBd45Db7F6866d5d3Abe048ce033',
    WETH: '', // TODO - Update collateral token address once it's deployed
  },
  raftDebtToken: '0xAABF1f5e5C9b559aaCD3c97B41B0B1ae593e31A8',
  positionManager: '0xeaf8aad45d563f14d8b443277dd51c426ad8607f',
  positionManagerStEth: '0x4e01f8c03893be67b60af6a1b49d6e51a8781e3c',
  priceFeeds: {
    wstETH: '0x0341b185e55A0860D6a7e853fd44D1f4fe37dB37',
    WETH: '', // TODO - Update price feed address once it's deployed
  },
  testNetwork: true,
};
