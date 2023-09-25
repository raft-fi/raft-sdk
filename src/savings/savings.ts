import { ContractRunner, ethers } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { SECONDS_PER_YEAR } from '../constants';
import { RSavingsRate } from '../typechain';
import { getTokenContract } from '../utils';
import { RaftConfig } from '../config';

export type SupportedSavingsNetwork = 'ethereum' | 'ethereum-goerli' | 'base';

export const SUPPORTED_SAVINGS_NETWORKS: SupportedSavingsNetwork[] = ['ethereum', 'ethereum-goerli', 'base'];

export class Savings {
  protected providerOrSigner: ContractRunner;
  protected rSavingsRateContract: RSavingsRate;

  constructor(providerOrSigner: ContractRunner) {
    this.providerOrSigner = providerOrSigner;
    this.rSavingsRateContract = getTokenContract('RR', this.providerOrSigner);
  }

  async maxDeposit(): Promise<Decimal> {
    // Max deposit requires us to pass an address, but this address is not used to calculate max deposit
    // so we can pass a zero address
    return new Decimal(
      await this.rSavingsRateContract.maxDeposit(ethers.ZeroAddress),
      RaftConfig.networkConfig.tokens.RR.decimals,
    );
  }

  async getTvl(): Promise<Decimal> {
    return new Decimal(await this.rSavingsRateContract.totalAssets(), RaftConfig.networkConfig.tokens.RR.decimals);
  }

  async getCurrentYield(): Promise<Decimal> {
    const issuanceRate = new Decimal(
      await this.rSavingsRateContract.issuanceRate(),
      RaftConfig.networkConfig.tokens.RR.decimals,
    );
    return issuanceRate.mul(SECONDS_PER_YEAR);
  }
}

export function isSupportedSavingsNetwork(value: string): value is SupportedSavingsNetwork {
  const networks: string[] = [...SUPPORTED_SAVINGS_NETWORKS];
  if (networks.includes(value)) {
    return true;
  }
  return false;
}
