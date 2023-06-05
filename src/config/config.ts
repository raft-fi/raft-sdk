import { ZeroAddress } from 'ethers';
import { CollateralToken, Token } from '../types';
import { goerliConfig } from './goerli';
import { mainnetConfig } from './mainnet';
import { NetworkConfig, SupportedNetwork } from './types';

const networkConfig: { [network in SupportedNetwork]: NetworkConfig } = {
  mainnet: mainnetConfig,
  goerli: goerliConfig,
};

const networkIds: { [network in SupportedNetwork]: number } = {
  mainnet: 1,
  goerli: 5,
};

export class RaftConfig {
  private static _network: SupportedNetwork = 'goerli'; // TODO: change to mainnet
  private static _subgraphEndpoint = '';

  public static setNetwork(network: SupportedNetwork) {
    this._network = network;
  }

  public static setSubgraphEndpoint(subgraphEndpoint: string) {
    this._subgraphEndpoint = subgraphEndpoint;
  }

  static get networkId(): number {
    return networkIds[this._network];
  }

  static get networkConfig(): NetworkConfig {
    return networkConfig[this._network];
  }

  static get isTestNetwork(): boolean {
    return this.networkConfig.testNetwork;
  }

  static get subgraphEndpoint(): string {
    return this._subgraphEndpoint;
  }

  static getTokenAddress(token: Token): string | null {
    switch (token) {
      case 'stETH':
        return this.networkConfig.stEth;

      case 'wstETH':
        return this.networkConfig.wstEth;

      case 'R':
        return this.networkConfig.r;

      default:
        return null;
    }
  }

  static getTokenTicker(address: string): Token | null {
    switch (address.toLowerCase()) {
      case ZeroAddress:
        return 'ETH';

      case this.networkConfig.stEth.toLowerCase():
        return 'stETH';

      case this.networkConfig.wstEth.toLowerCase():
        return 'wstETH';

      case this.networkConfig.r.toLowerCase():
        return 'R';
    }

    return null;
  }

  static getPositionManagerAddress(collateralToken: CollateralToken): string {
    switch (collateralToken) {
      case 'ETH':
      case 'stETH':
        return this.networkConfig.positionManagerStEth;

      default:
        return this.networkConfig.positionManager;
    }
  }
}
