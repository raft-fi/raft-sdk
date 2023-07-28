import { Decimal } from '@tempusfinance/decimal';
import { Overrides, StateMutability, TypedContractMethod } from '../typechain/common';
import { Signer, TransactionResponse, hexlify } from 'ethers';

interface BuiltTransactionData {
  sendTransaction: () => Promise<TransactionResponse>;
  gasEstimate: Decimal;
  gasLimit: Decimal;
}

/**
 * Sends a transaction with a gas limit that is a multiple of the estimated gas cost.
 * @param method The contract's method to call.
 * @param args The arguments to pass to the contract's method.
 * @param value The value to send with the transaction.
 * @param tag The tag to append to the transaction's data. Does not affect the transaction's execution.
 * @param signer The signer to use to send the transaction in case the tag is provided.
 * @param gasLimitMultiplier The multiplier to apply to estimated gas cost.
 * @returns Transaction response.
 */
export async function buildTransactionWithGasLimit<
  A extends Array<unknown>,
  R,
  S extends Exclude<StateMutability, 'view'>,
>(
  method: TypedContractMethod<A, R, S>,
  args: { [I in keyof A]-?: A[I] },
  gasLimitMultiplier: Decimal = Decimal.ONE,
  tag?: string,
  signer?: Signer,
  value?: bigint,
): Promise<BuiltTransactionData> {
  const gasEstimate = new Decimal(await method.estimateGas(...args, { value } as Overrides<S>), Decimal.PRECISION);
  const gasLimit = gasEstimate.mul(gasLimitMultiplier);
  const overrides = { value, gasLimit: gasLimit.toBigInt() } as Overrides<S>;

  if (!signer || !tag) {
    return {
      sendTransaction: () => method(...args, overrides),
      gasEstimate,
      gasLimit,
    };
  }

  const hexTag = tag ? hexlify(Uint8Array.from(tag.split('').map(letter => letter.charCodeAt(0)))) : undefined;
  const transactionRequest = await method.populateTransaction(...args, overrides);
  transactionRequest.data = `${transactionRequest.data}${hexTag?.slice(2) ?? ''}`;

  return {
    sendTransaction: () => signer.sendTransaction(transactionRequest),
    gasEstimate,
    gasLimit,
  };
}
