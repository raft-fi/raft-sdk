import { NetworkConfig } from './types';

export const mainnetConfig: NetworkConfig = {
  wstEth: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0',
  stEth: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
  r: '0x183015a9bA6fF60230fdEaDc3F43b3D788b13e21',
  raftCollateralTokens: {
    wstETH: '0xa7820009f79687d39f51909a01e7fd4b4d0663f8',
  },
  raftDebtToken: '0x1C1D49D8F601f19D2Fa88b14BEf491759aaaF5d8',
  positionManager: '0x5f59b322eb3e16a0c78846195af1f588b77403fc',
  positionManagerStEth: '0x839d6833cee34ffab6fa9057b39f02bd3091a1d6',
  testNetwork: false,
};
