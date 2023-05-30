import { ZeroAddress } from 'ethers';
import { CollateralToken, Token } from '../types';
import { goerliNetworkAddresses } from './goerli';
import { mainnetNetworkAddresses } from './mainnet';
import { NetworkAddresses, SupportedNetwork } from './types';

const addresses: { [network in SupportedNetwork]: NetworkAddresses } = {
  mainnet: mainnetNetworkAddresses,
  goerli: goerliNetworkAddresses,
};

const networkIds: { [network in SupportedNetwork]: number } = {
  mainnet: 1,
  goerli: 5,
};

export class RaftConfig {
  private static network: SupportedNetwork = 'goerli'; // TODO: change to mainnet

  public static setNetwork(network: SupportedNetwork) {
    this.network = network;
  }

  static get networkId(): number {
    return networkIds[this.network];
  }

  static get addresses(): NetworkAddresses {
    return addresses[this.network];
  }

  static getTokenAddress(token: Token): string | null {
    switch (token) {
      case 'stETH':
        return this.addresses.stEth;

      case 'wstETH':
        return this.addresses.wstEth;

      case 'R':
        return this.addresses.r;

      default:
        return null;
    }
  }

  static getTokenTicker(address: string): Token | null {
    switch (address.toLowerCase()) {
      case ZeroAddress:
        return 'ETH';

      case this.addresses.stEth.toLowerCase():
        return 'stETH';

      case this.addresses.wstEth.toLowerCase():
        return 'wstETH';

      case this.addresses.r.toLowerCase():
        return 'R';
    }

    return null;
  }

  static getPositionManagerAddress(collateralToken: CollateralToken): string {
    switch (collateralToken) {
      case 'ETH':
      case 'stETH':
        return this.addresses.positionManagerStEth;

      default:
        return this.addresses.positionManager;
    }
  }
}
