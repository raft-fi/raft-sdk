import { JsonRpcProvider } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { RaftConfig } from './config';
import { Token } from './types';
import { ERC20, ERC20Permit, ERC20Permit__factory, ERC20__factory } from './typechain';

export class Allowance {
  protected readonly token: Token;

  private allowance: Decimal | null = null;
  private walletAddress: string;
  private spender: string;
  private provider: JsonRpcProvider;
  private tokenContract: ERC20Permit | ERC20 | null;

  /**
   * Creates a new representation of an allowance.
   * @param token The token for the allowance.
   * @param walletAddress Wallet to check allowance for.
   * @param spender Address to which allowance belongs.
   * @param provider: Provider to use for data fetching.
   */
  public constructor(token: Token, walletAddress: string, spender: string, provider: JsonRpcProvider) {
    this.token = token;
    this.walletAddress = walletAddress;
    this.spender = spender;
    this.provider = provider;

    const tokenConfig = RaftConfig.networkConfig.tokenTickerToTokenConfigMap[token];

    if (tokenConfig.ticker === 'ETH') {
      this.tokenContract = null;
    } else if (tokenConfig.supportsPermit) {
      this.tokenContract = ERC20Permit__factory.connect(RaftConfig.getTokenAddress(this.token), this.provider);
    } else {
      this.tokenContract = ERC20__factory.connect(RaftConfig.getTokenAddress(this.token), this.provider);
    }
  }

  /**
   * Fetches and returns token allowance.
   */
  public async fetchAllowance(): Promise<Decimal | null> {
    if (this.tokenContract) {
      this.allowance = new Decimal(
        await this.tokenContract.allowance(this.walletAddress, this.spender),
        Decimal.PRECISION,
      );
    } else {
      // In case token is ETH
      this.allowance = Decimal.MAX_DECIMAL;
    }

    return this.allowance;
  }
}
