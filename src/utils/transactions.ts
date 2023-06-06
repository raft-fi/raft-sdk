import { Decimal } from '@tempusfinance/decimal';
import { Overrides, StateMutability, TypedContractMethod } from '../typechain/common';
import { ContractTransactionResponse } from 'ethers';

/**
 * Sends a transaction with a gas limit that is a multiple of the estimated gas cost.
 * @param method The contract's method to call.
 * @param args The arguments to pass to the contract's method.
 * @param value The value to send with the transaction.
 * @param gasLimitMultiplier The multiplier to apply to estimated gas cost.
 * @returns Transaction response.
 */
export async function sendTransactionWithGasLimit<
  A extends Array<unknown>,
  R,
  S extends Exclude<StateMutability, 'view'>,
>(
  method: TypedContractMethod<A, R, S>,
  args: { [I in keyof A]-?: A[I] },
  gasLimitMultiplier: Decimal = Decimal.ONE,
  value?: bigint,
): Promise<ContractTransactionResponse> {
  const gasEstimate = await method.estimateGas(...args, { value } as Overrides<S>);
  const gasLimit = new Decimal(gasEstimate, Decimal.PRECISION).mul(gasLimitMultiplier).toBigInt();
  return await method(...args, { value, gasLimit } as Overrides<S>);
}
