import { Decimal } from '@tempusfinance/decimal';
import { describe, expect, it, vi } from 'vitest';
import { buildTransactionWithGasLimit, getTokenContract } from '../../src/utils';
import { TypedContractMethod } from '../../src/typechain/common';
import { JsonRpcProvider, Wallet } from 'ethers';
import { RaftConfig } from '../../src/config';

const mockMethod = {
  estimateGas: vi.fn().mockResolvedValue(100000n),
  populateTransaction: vi.fn(),
} as unknown as TypedContractMethod<never[], unknown, 'nonpayable'>;

describe('buildTransactionWithGasLimit', () => {
  it.skipIf(process.env.CI !== 'true')('should return valid gas estimations and limit', async () => {
    const provider = new JsonRpcProvider('http://127.0.0.1:8545');
    const signer = Wallet.fromPhrase('test test test test test test test test test test test junk', provider);

    const gasLimitMultiplier = new Decimal(1.5);
    const { gasEstimate, gasLimit } = await buildTransactionWithGasLimit(mockMethod, [], signer, gasLimitMultiplier);

    expect(gasEstimate).toEqual(new Decimal(2103312526500000n, Decimal.PRECISION));
    expect(gasLimit).toEqual(new Decimal(150000n, Decimal.PRECISION));
  });

  it.skipIf(process.env.CI !== 'true')(
    'should append tag to transaction data',
    async () => {
      const provider = new JsonRpcProvider('http://127.0.0.1:8545');
      const signer = Wallet.fromPhrase('test test test test test test test test test test test junk', provider);
      const tag = 'tag';
      const stETH = getTokenContract('stETH', signer);

      const { sendTransaction: sendTransactionNoTag } = await buildTransactionWithGasLimit(
        stETH.approve,
        [RaftConfig.getPositionManagerAddress('wstETH'), 1n],
        signer,
      );
      const transactionResponseNoTag = await sendTransactionNoTag();
      await transactionResponseNoTag.wait();

      const { sendTransaction: sendTransactionWithTag } = await buildTransactionWithGasLimit(
        stETH.approve,
        [RaftConfig.getPositionManagerAddress('wstETH'), 1n],
        signer,
        undefined,
        tag,
      );
      const transactionResponseWithTag = await sendTransactionWithTag();
      await transactionResponseWithTag.wait();

      const encodedTag = tag
        .split('')
        .map(c => c.charCodeAt(0).toString(16))
        .join('');

      expect(transactionResponseWithTag.data).toEqual(transactionResponseNoTag.data + encodedTag);

      const { sendTransaction: sendTransactionEmptyTag } = await buildTransactionWithGasLimit(
        stETH.approve,
        [RaftConfig.getPositionManagerAddress('wstETH'), 1n],
        signer,
        undefined,
        '',
      );
      const transactionResponseEmptyTag = await sendTransactionEmptyTag();
      await transactionResponseEmptyTag.wait();

      expect(transactionResponseEmptyTag.data).toEqual(transactionResponseNoTag.data);
    },
    20_000,
  );
});
