import { Token } from '../types';
import { goerliNetworkAddresses } from './goerli';
import { NetworkAddresses, SupportedNetwork } from './types';

const addresses: { [network in SupportedNetwork]: NetworkAddresses } = {
  goerli: goerliNetworkAddresses,
};

export class RaftConfig {
  private static network: SupportedNetwork = 'goerli'; // TODO: change to mainnet

  public static setNetwork(network: SupportedNetwork) {
    this.network = network;
  }

  static get addresses(): NetworkAddresses {
    return addresses[this.network];
  }

  static getTokenAddress(token: Token): string {
    switch (token) {
      case 'stETH':
        return this.addresses.stEth;

      case 'wstETH':
        return this.addresses.wstEth;

      case 'R':
        return this.addresses.r;

      default:
        return '';
    }
  }
}
