import { ContractRunner } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { WstETH__factory } from '../typechain';

export async function getWstEthToStEthRate(wstETHAddress: string, runner: ContractRunner): Promise<Decimal> {
  const contract = WstETH__factory.connect(wstETHAddress, runner);
  const wstEthPerStEth = await contract.stEthPerToken();

  return new Decimal(wstEthPerStEth, Decimal.PRECISION);
}
