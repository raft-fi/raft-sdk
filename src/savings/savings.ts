import { Provider, Signer, ethers } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { RaftConfig } from '../config';
import { RSavingsModule, RSavingsModule__factory } from '../typechain';

export class Savings {
  protected providerOrSigner: Provider | Signer;
  protected rSavingsModuleContract: RSavingsModule;

  constructor(providerOrSigner: Provider | Signer) {
    this.providerOrSigner = providerOrSigner;

    this.rSavingsModuleContract = RSavingsModule__factory.connect(
      RaftConfig.networkConfig.rSavingsModule,
      this.providerOrSigner,
    );
  }

  async maxDeposit() {
    // Max deposit requires us to pass an address, but this address is not used to calculate max deposit
    // so we can pass a zero address
    return new Decimal(await this.rSavingsModuleContract.maxDeposit(ethers.ZeroAddress), Decimal.PRECISION);
  }
}
