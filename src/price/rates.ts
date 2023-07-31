import { Provider } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { getTokenContract } from '../utils';

export async function getWstEthToStEthRate(provider: Provider): Promise<Decimal> {
  const contract = getTokenContract('wstETH', provider);
  const wstEthPerStEth = await contract.stEthPerToken();

  return new Decimal(wstEthPerStEth, Decimal.PRECISION);
}
