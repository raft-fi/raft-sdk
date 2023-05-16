import { Token } from '../types';
import { goerliNetworkAddresses } from './goerli';
import { NetworkAddresses, SupportedNetwork } from './types';

const addresses: { [network in SupportedNetwork]: NetworkAddresses } = {
  goerli: goerliNetworkAddresses,
};

const networkIds: { [network in SupportedNetwork]: number } = {
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
      case this.addresses.stEth.toLowerCase():
        return 'stETH';

      case this.addresses.wstEth.toLowerCase():
        return 'wstETH';

      case this.addresses.r.toLowerCase():
        return 'R';
    }

    return null;
  }
}
