import { JsonRpcProvider } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { RaftConfig } from './config';
import { Token } from './types';
import { ERC20, ERC20Permit, ERC20Permit__factory, ERC20__factory } from './typechain';

export class Balance {
  protected readonly token: Token;

  private balance: Decimal | null = null;
  private walletAddress: string;
  private provider: JsonRpcProvider;
  private tokenContract: ERC20Permit | ERC20 | null;

  /**
   * Creates a new representation of a balance.
   * @param token The token for the balance.
   * @param walletAddress Wallet to which balance belongs.
   * @param provider: Provider to use for data fetching.
   */
  public constructor(token: Token, walletAddress: string, provider: JsonRpcProvider) {
    this.token = token;
    this.walletAddress = walletAddress;
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
   * Fetches and returns token balance.
   */
  public async fetchBalance(): Promise<Decimal | null> {
    if (this.tokenContract) {
      this.balance = new Decimal(await this.tokenContract.balanceOf(this.walletAddress), Decimal.PRECISION);
    } else {
      // In case token is ETH
      this.balance = new Decimal(await this.provider.getBalance(this.walletAddress), Decimal.PRECISION);
    }

    return this.balance;
  }
}
