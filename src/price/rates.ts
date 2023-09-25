import { ContractRunner } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { RaftConfig } from '../config';
import { RR_TOKEN } from '../types';
import { getTokenContract } from '../utils';

export async function getWstEthToStEthRate(runner: ContractRunner): Promise<Decimal> {
  const contract = getTokenContract('wstETH', runner);
  const wstEthPerStEth = await contract.stEthPerToken();

  return new Decimal(wstEthPerStEth, RaftConfig.networkConfig.tokens.stETH.decimals);
}

export async function getRRToRRate(runner: ContractRunner): Promise<Decimal> {
  const contract = getTokenContract(RR_TOKEN, runner);
  const value = await contract.convertToAssets(Decimal.ONE.toBigInt(RaftConfig.networkConfig.tokens.RR.decimals));

  return new Decimal(value, RaftConfig.networkConfig.tokens.R.decimals);
}
