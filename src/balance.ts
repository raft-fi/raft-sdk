import { Provider } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { Erc20TokenContract, Token } from './types';
import { VotingEscrow } from './typechain';
import { getTokenContract } from './utils';
import { RaftConfig } from './config';

export class Balance {
  protected readonly token: Token;

  private balance: Decimal | null = null;
  private walletAddress: string;
  private provider: Provider;
  private tokenContract: Erc20TokenContract | VotingEscrow;

  /**
   * Creates a new representation of a balance.
   * @param token The token for the balance.
   * @param walletAddress Wallet to which balance belongs.
   * @param provider: Provider to use for data fetching.
   */
  public constructor(token: Token, walletAddress: string, provider: Provider) {
    this.token = token;
    this.walletAddress = walletAddress;
    this.provider = provider;
    this.tokenContract = getTokenContract(this.token, this.provider);
  }

  /**
   * Fetches and returns token balance.
   */
  public async fetchBalance(): Promise<Decimal | null> {
    const { decimals } = RaftConfig.networkConfig.tokens[this.token];
    this.balance = new Decimal(await this.tokenContract.balanceOf(this.walletAddress), decimals);

    return this.balance;
  }
}
