import { ContractRunner, ethers } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { SECONDS_PER_YEAR } from '../constants';
import { RSavingsRate } from '../typechain';
import { getTokenContract } from '../utils';
import { RaftConfig } from '../config';

export type SupportedSavingsNetwork = 'mainnet' | 'goerli' | 'base';

export const SUPPORTED_SAVINGS_NETWORKS: SupportedSavingsNetwork[] = ['mainnet', 'goerli', 'base'];

export class Savings {
  protected providerOrSigner: ContractRunner;
  protected network: SupportedSavingsNetwork;
  protected rSavingsRateContract: RSavingsRate;

  constructor(providerOrSigner: ContractRunner, network: SupportedSavingsNetwork = 'mainnet') {
    this.providerOrSigner = providerOrSigner;
    this.network = network;
    this.rSavingsRateContract = getTokenContract('RR', this.providerOrSigner, network);
  }

  async maxDeposit(): Promise<Decimal> {
    // Max deposit requires us to pass an address, but this address is not used to calculate max deposit
    // so we can pass a zero address
    return new Decimal(
      await this.rSavingsRateContract.maxDeposit(ethers.ZeroAddress),
      RaftConfig.getNetworkConfig(this.network).tokens.R.decimals,
    );
  }

  async getTvl(): Promise<Decimal> {
    return new Decimal(
      await this.rSavingsRateContract.totalAssets(),
      RaftConfig.getNetworkConfig(this.network).tokens.R.decimals,
    );
  }

  async getYieldReserve(): Promise<Decimal> {
    const rToken = getTokenContract('R', this.providerOrSigner, this.network);
    const rBalance = new Decimal(
      await rToken.balanceOf(RaftConfig.getNetworkConfig(this.network).tokens.RR.address),
      RaftConfig.getNetworkConfig(this.network).tokens.R.decimals,
    );
    const tvl = await this.getTvl();
    return rBalance.sub(tvl);
  }

  async getCurrentYield(): Promise<Decimal> {
    const issuanceRate = new Decimal(
      await this.rSavingsRateContract.issuanceRate(),
      RaftConfig.getNetworkConfig(this.network).tokens.RR.decimals,
    );
    return issuanceRate.mul(SECONDS_PER_YEAR);
  }
}

export function isSupportedSavingsNetwork(value: string): value is SupportedSavingsNetwork {
  const networks: string[] = [...SUPPORTED_SAVINGS_NETWORKS];
  return networks.includes(value);
}
