import { CollateralToken, TOKENS, Token, UnderlyingCollateralToken } from '../types';
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

  static getTokenAddress(token: Token): string {
    return this.networkConfig.tokens[token].address;
  }

  static getTokenTicker(address: string): Token | null {
    const tokenTicker = TOKENS.find(
      ticker => this.networkConfig.tokens[ticker].address.toLowerCase() === address.toLowerCase(),
    );

    return tokenTicker ?? null;
  }

  static getPositionManagerAddress(
    underlyingCollateralToken: UnderlyingCollateralToken,
    collateralToken: CollateralToken,
  ): string {
    const collateralConfig =
      this.networkConfig.underlyingTokens[underlyingCollateralToken].supportedCollateralTokens[collateralToken];
    if (!collateralConfig) {
      throw new Error(
        `Underlying collateral token ${underlyingCollateralToken} does not support collateral token ${collateralToken}`,
      );
    }

    return collateralConfig.positionManager;
  }
}
