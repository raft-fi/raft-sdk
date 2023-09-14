import { ContractRunner, ethers } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { RaftConfig } from '../config';
import { RR_PRECISION, SECONDS_PER_YEAR } from '../constants';
import { RSavingsModule, RSavingsModule__factory } from '../typechain';

export class Savings {
  protected providerOrSigner: ContractRunner;
  protected rSavingsModuleContract: RSavingsModule;

  constructor(providerOrSigner: ContractRunner) {
    this.providerOrSigner = providerOrSigner;

    this.rSavingsModuleContract = RSavingsModule__factory.connect(
      RaftConfig.networkConfig.rSavingsModule,
      this.providerOrSigner,
    );
  }

  async maxDeposit(): Promise<Decimal> {
    // Max deposit requires us to pass an address, but this address is not used to calculate max deposit
    // so we can pass a zero address
    return new Decimal(await this.rSavingsModuleContract.maxDeposit(ethers.ZeroAddress), RR_PRECISION);
  }

  async getTvl(): Promise<Decimal> {
    return new Decimal(await this.rSavingsModuleContract.totalAssets(), RR_PRECISION);
  }

  async getCurrentYield(): Promise<Decimal> {
    const issuanceRate = new Decimal(await this.rSavingsModuleContract.issuanceRate(), RR_PRECISION);
    return issuanceRate.mul(SECONDS_PER_YEAR);
  }
}
