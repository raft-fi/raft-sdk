import { TOKENS, Token, UnderlyingCollateralToken } from '../types';
import { goerliConfig } from './goerli';
import { mainnetConfig } from './mainnet';
import { NetworkConfig, SupportedCollateralTokens, SupportedNetwork } from './types';

const networkConfig: Record<SupportedNetwork, NetworkConfig> = {
  mainnet: mainnetConfig,
  goerli: goerliConfig,
};

const networkIds: Record<SupportedNetwork, number> = {
  mainnet: 1,
  goerli: 5,
};

export class RaftConfig {
  private static _network: SupportedNetwork = 'mainnet';
  private static _subgraphEndpoint = '';
  private static _balancerSubgraphEndpoint = '';

  public static setNetwork(network: SupportedNetwork) {
    this._network = network;
  }

  public static setSubgraphEndpoint(subgraphEndpoint: string) {
    this._subgraphEndpoint = subgraphEndpoint;
  }

  public static setBalancerSubgraphEndpoint(balancerSubgraphEndpoint: string) {
    this._balancerSubgraphEndpoint = balancerSubgraphEndpoint;
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

  static get balancerSubgraphEndpoint(): string {
    return this._balancerSubgraphEndpoint;
  }

  static getTokenAddress(token: Token): string {
    return this.networkConfig.tokens[token].address;
  }

  static getTokenTicker(address: string): Token | null {
    const tokenTicker = TOKENS.find(
      ticker => this.networkConfig.tokens[ticker].address.toLowerCase() === address.toLowerCase(),
    );

    return tokenTicker ?? null;
  }

  static getPositionManagerAddress<U extends UnderlyingCollateralToken>(
    underlyingCollateralToken: U,
    collateralToken: SupportedCollateralTokens[U],
  ): string {
    return this.networkConfig.underlyingTokens[underlyingCollateralToken].supportedCollateralTokens[collateralToken]
      .positionManager;
  }
}
