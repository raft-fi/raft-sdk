import { Decimal } from '@tempusfinance/decimal';
import { ERC20 } from '../typechain';

export const getApproval = async (
  amount: Decimal,
  walletAddress: string,
  tokenContract: ERC20,
  spender: string,
): Promise<void> => {
  const tokenAllowance = await tokenContract.allowance(walletAddress, spender);
  const spendAmount = amount.toBigInt(Decimal.PRECISION);

  if (tokenAllowance < spendAmount) {
    await tokenContract.approve(spender, spendAmount);
  }
};
