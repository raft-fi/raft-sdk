import { Provider } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { Token } from './types';
import { ERC20, ERC20Permit } from './typechain';
import { getTokenContract } from './utils';
import { RaftConfig } from './config';
import { ETH_PRECISION } from './constants';

export class Balance {
  protected readonly token: Token;

  private balance: Decimal | null = null;
  private walletAddress: string;
  private provider: Provider;
  private tokenContract: ERC20Permit | ERC20 | null;

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
    if (this.tokenContract) {
      const tokenConfig = RaftConfig.networkConfig.tokens[this.token];
      this.balance = new Decimal(await this.tokenContract.balanceOf(this.walletAddress), tokenConfig.decimals);
    } else {
      // In case token is ETH
      this.balance = new Decimal(await this.provider.getBalance(this.walletAddress), ETH_PRECISION);
    }

    return this.balance;
  }
}
