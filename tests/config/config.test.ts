import { ZeroAddress } from 'ethers';
import { RaftConfig, Token } from '../../src';
import { goerliConfig } from '../../src/config/goerli';
import { mainnetConfig } from '../../src/config/mainnet';

describe('RaftConfig', () => {
  it('should set network', () => {
    RaftConfig.setNetwork('mainnet');
    expect(RaftConfig.networkId).toEqual(1);

    RaftConfig.setNetwork('goerli');
    expect(RaftConfig.networkId).toEqual(5);
  });

  it('should set subgraph endpoint', () => {
    RaftConfig.setSubgraphEndpoint('some-endpoint');
    expect(RaftConfig.subgraphEndpoint).toEqual('some-endpoint');
  });

  it('should return true for test network', () => {
    RaftConfig.setNetwork('mainnet');
    expect(RaftConfig.isTestNetwork).toBeFalsy();

    RaftConfig.setNetwork('goerli');
    expect(RaftConfig.isTestNetwork).toBeTruthy();
  });

  it('should get token address', () => {
    RaftConfig.setNetwork('mainnet');
    expect(RaftConfig.getTokenAddress('ETH')).toEqual(mainnetConfig.tokenTickerToTokenConfigMap.ETH.address);
    expect(RaftConfig.getTokenAddress('stETH')).toEqual(mainnetConfig.tokenTickerToTokenConfigMap.stETH.address);
    expect(RaftConfig.getTokenAddress('wstETH')).toEqual(mainnetConfig.tokenTickerToTokenConfigMap.wstETH.address);
    expect(RaftConfig.getTokenAddress('R')).toEqual(mainnetConfig.tokenTickerToTokenConfigMap.R.address);

    RaftConfig.setNetwork('goerli');
    expect(RaftConfig.getTokenAddress('ETH')).toEqual(goerliConfig.tokenTickerToTokenConfigMap.ETH.address);
    expect(RaftConfig.getTokenAddress('stETH')).toEqual(goerliConfig.tokenTickerToTokenConfigMap.stETH.address);
    expect(RaftConfig.getTokenAddress('wstETH')).toEqual(goerliConfig.tokenTickerToTokenConfigMap.wstETH.address);
    expect(RaftConfig.getTokenAddress('R')).toEqual(goerliConfig.tokenTickerToTokenConfigMap.R.address);
  });

  it('should throw error if token address is not found', () => {
    for (const network of ['mainnet', 'goerli'] as const) {
      RaftConfig.setNetwork(network);
      expect(() => RaftConfig.getTokenAddress('some-token' as unknown as Token)).toThrow(
        'Failed to fetch some-token address!',
      );
    }
  });

  it('should get token ticker', () => {
    RaftConfig.setNetwork('mainnet');
    expect(RaftConfig.getTokenTicker(ZeroAddress)).toEqual('ETH');
    expect(RaftConfig.getTokenTicker(mainnetConfig.tokenTickerToTokenConfigMap.stETH.address)).toEqual('stETH');
    expect(RaftConfig.getTokenTicker(mainnetConfig.tokenTickerToTokenConfigMap.wstETH.address)).toEqual('wstETH');
    expect(RaftConfig.getTokenTicker(mainnetConfig.tokenTickerToTokenConfigMap.R.address)).toEqual('R');

    RaftConfig.setNetwork('goerli');
    expect(RaftConfig.getTokenTicker(ZeroAddress)).toEqual('ETH');
    expect(RaftConfig.getTokenTicker(goerliConfig.tokenTickerToTokenConfigMap.stETH.address)).toEqual('stETH');
    expect(RaftConfig.getTokenTicker(goerliConfig.tokenTickerToTokenConfigMap.wstETH.address)).toEqual('wstETH');
    expect(RaftConfig.getTokenTicker(goerliConfig.tokenTickerToTokenConfigMap.R.address)).toEqual('R');
  });

  it('should return null if token ticker is not found', () => {
    for (const network of ['mainnet', 'goerli'] as const) {
      RaftConfig.setNetwork(network);
      expect(RaftConfig.getTokenTicker('0x123')).toBeNull();
    }
  });

  it('should return position manager', () => {
    RaftConfig.setNetwork('mainnet');
    expect(RaftConfig.getPositionManagerAddress('ETH')).toEqual(
      mainnetConfig.tokenTickerToTokenConfigMap.ETH.positionManager,
    );
    expect(RaftConfig.getPositionManagerAddress('stETH')).toEqual(mainnetConfig.positionManagerStEth);
    expect(RaftConfig.getPositionManagerAddress('wstETH')).toEqual(mainnetConfig.positionManager);

    RaftConfig.setNetwork('goerli');
    expect(RaftConfig.getPositionManagerAddress('ETH')).toEqual(
      goerliConfig.tokenTickerToTokenConfigMap.ETH.positionManager,
    );
    expect(RaftConfig.getPositionManagerAddress('stETH')).toEqual(goerliConfig.positionManagerStEth);
    expect(RaftConfig.getPositionManagerAddress('wstETH')).toEqual(goerliConfig.positionManager);
  });
});
