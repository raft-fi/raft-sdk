import { ZeroAddress } from 'ethers';
import { CollateralToken, Token } from '../types';
import { goerliConfig } from './goerli';
import { mainnetConfig } from './mainnet';
import { NetworkConfig, SupportedNetwork } from './types';

type TokenAddressType = {
  ETH: null;
  WETH: string;
  stETH: string;
  wstETH: string;
  R: string;
};

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

  static getTokenAddress<T extends Token>(token: T): TokenAddressType[T] {
    switch (token) {
      case 'ETH':
        return ZeroAddress as TokenAddressType[T];

      case 'WETH':
        return this.networkConfig.wEth as TokenAddressType[T];

      case 'stETH':
        return this.networkConfig.stEth as TokenAddressType[T];

      case 'wstETH':
        return this.networkConfig.wstEth as TokenAddressType[T];

      case 'R':
        return this.networkConfig.r as TokenAddressType[T];

      default:
        return null as TokenAddressType[T];
    }
  }

  static getTokenTicker(address: string): Token | null {
    switch (address.toLowerCase()) {
      case ZeroAddress:
        return 'ETH';

      case this.networkConfig.wEth.toLowerCase():
        return 'WETH';

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
      // TODO - Add separate position manger for ETH token once it's deployed
      case 'ETH':
      case 'stETH':
        return this.networkConfig.positionManagerStEth;

      default:
        return this.networkConfig.positionManager;
    }
  }
}
