import { Provider } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { WstETH__factory } from '../typechain';

export async function getWstEthToStEthRate(wstETHAddress: string, provider: Provider): Promise<Decimal> {
  const contract = WstETH__factory.connect(wstETHAddress, provider);
  const wstEthPerStEth = await contract.stEthPerToken();

  return new Decimal(wstEthPerStEth, Decimal.PRECISION);
}
