import { AddressLike, Provider } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { Token } from './types';
import { ERC20, ERC20Permit, WstETH } from './typechain';
import { getTokenContract } from './utils';
import { RaftConfig } from './config';

/**
 * Fetches and returns token allowance.
 * @param tokenContract Token contract to check allowance for.
 * @param owner Wallet to check allowance for.
 * @param spender Address to which allowance belongs.
 * @returns Token allowance.
 */
export async function getTokenAllowance(
  token: Token,
  tokenContract: ERC20 | ERC20Permit | WstETH,
  owner: AddressLike,
  spender: AddressLike,
): Promise<Decimal> {
  const tokenConfig = RaftConfig.networkConfig.tokens[token];
  return new Decimal(await tokenContract.allowance(owner, spender), tokenConfig.decimals);
}

export class Allowance {
  protected readonly token: Token;

  private allowance: Decimal | null = null;
  private owner: AddressLike;
  private spender: AddressLike;
  private provider: Provider;
  private tokenContract: ERC20Permit | ERC20 | WstETH;

  /**
   * Creates a new representation of an allowance.
   * @param token The token for the allowance.
   * @param owner Wallet to check allowance for.
   * @param spender Address to which allowance belongs.
   * @param provider: Provider to use for data fetching.
   */
  public constructor(token: Token, owner: AddressLike, spender: AddressLike, provider: Provider) {
    this.token = token;
    this.owner = owner;
    this.spender = spender;
    this.provider = provider;
    this.tokenContract = getTokenContract(this.token, this.provider);
  }

  /**
   * Fetches and returns token allowance.
   */
  public async fetchAllowance(): Promise<Decimal | null> {
    this.allowance = await getTokenAllowance(this.token, this.tokenContract, this.owner, this.spender);

    return this.allowance;
  }
}
