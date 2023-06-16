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
    expect(RaftConfig.getTokenAddress('ETH')).toEqual(mainnetConfig.tokens.ETH.address);
    expect(RaftConfig.getTokenAddress('stETH')).toEqual(mainnetConfig.tokens.stETH.address);
    expect(RaftConfig.getTokenAddress('wstETH')).toEqual(mainnetConfig.tokens.wstETH.address);
    expect(RaftConfig.getTokenAddress('R')).toEqual(mainnetConfig.tokens.R.address);

    RaftConfig.setNetwork('goerli');
    expect(RaftConfig.getTokenAddress('ETH')).toEqual(goerliConfig.tokens.ETH.address);
    expect(RaftConfig.getTokenAddress('stETH')).toEqual(goerliConfig.tokens.stETH.address);
    expect(RaftConfig.getTokenAddress('wstETH')).toEqual(goerliConfig.tokens.wstETH.address);
    expect(RaftConfig.getTokenAddress('R')).toEqual(goerliConfig.tokens.R.address);
  });

  it('should get token ticker', () => {
    RaftConfig.setNetwork('mainnet');
    expect(RaftConfig.getTokenTicker(ZeroAddress)).toEqual('ETH');
    expect(RaftConfig.getTokenTicker(mainnetConfig.tokens.stETH.address)).toEqual('stETH');
    expect(RaftConfig.getTokenTicker(mainnetConfig.tokens.wstETH.address)).toEqual('wstETH');
    expect(RaftConfig.getTokenTicker(mainnetConfig.tokens.R.address)).toEqual('R');

    RaftConfig.setNetwork('goerli');
    expect(RaftConfig.getTokenTicker(ZeroAddress)).toEqual('ETH');
    expect(RaftConfig.getTokenTicker(goerliConfig.tokens.stETH.address)).toEqual('stETH');
    expect(RaftConfig.getTokenTicker(goerliConfig.tokens.wstETH.address)).toEqual('wstETH');
    expect(RaftConfig.getTokenTicker(goerliConfig.tokens.R.address)).toEqual('R');
  });

  it('should return null if token ticker is not found', () => {
    for (const network of ['mainnet', 'goerli'] as const) {
      RaftConfig.setNetwork(network);
      expect(RaftConfig.getTokenTicker('0x123')).toBeNull();
    }
  });

  it('should return position manager', () => {
    RaftConfig.setNetwork('mainnet');
    expect(RaftConfig.getPositionManagerAddress('wstETH', 'ETH')).toEqual(
      mainnetConfig.underlyingTokens.wstETH.supportedCollateralTokens.ETH?.positionManager,
    );
    expect(RaftConfig.getPositionManagerAddress('wstETH', 'stETH')).toEqual(mainnetConfig.positionManagerStEth);
    expect(RaftConfig.getPositionManagerAddress('wstETH', 'wstETH')).toEqual(mainnetConfig.positionManager);

    RaftConfig.setNetwork('goerli');
    expect(RaftConfig.getPositionManagerAddress('wstETH', 'ETH')).toEqual(
      goerliConfig.underlyingTokens.wstETH.supportedCollateralTokens.ETH?.positionManager,
    );
    expect(RaftConfig.getPositionManagerAddress('wstETH', 'stETH')).toEqual(goerliConfig.positionManagerStEth);
    expect(RaftConfig.getPositionManagerAddress('wstETH', 'wstETH')).toEqual(goerliConfig.positionManager);
  });
});
