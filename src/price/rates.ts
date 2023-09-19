import { ContractRunner } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { getTokenContract } from '../utils';
import { RaftConfig } from '../config';

export async function getWstEthToStEthRate(runner: ContractRunner): Promise<Decimal> {
  const contract = getTokenContract('wstETH', runner);
  const wstEthPerStEth = await contract.stEthPerToken();

  return new Decimal(wstEthPerStEth, RaftConfig.networkConfig.tokens.stETH.decimals);
}
