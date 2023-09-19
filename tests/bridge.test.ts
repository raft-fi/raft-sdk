import { Decimal } from '@tempusfinance/decimal';
import { AbiCoder, Signer } from 'ethers';
import { describe, expect, it, Mock, vi } from 'vitest';
import { Bridge, getTokenAllowance } from '../src';
import { CCIPRouter__factory } from '../src/typechain';
import { buildTransactionWithGasLimit } from '../src/utils';

const mockEoaSigner = {
  provider: {
    getCode: () => Promise.resolve('0x'),
  },
  getAddress: () => Promise.resolve('0x123'),
} as unknown as Signer;

vi.mock('../src/allowance', async () => ({
  ...(await vi.importActual<typeof import('../src/allowance')>('../src/allowance')),
  getTokenAllowance: vi.fn(),
}));

vi.mock('../src/bridge', async () => ({
  ...(await vi.importActual<typeof import('../src/bridge')>('../src/bridge')),
  getSourceChainRouterContract: vi.fn(),
}));

vi.mock('../src/utils/transactions', async () => ({
  ...(await vi.importActual<typeof import('../src/utils/transactions')>('../src/utils/transactions')),
  buildTransactionWithGasLimit: vi.fn(),
}));

describe('Bridge', () => {
  describe('getBridgeRSteps', () => {
    it('should generate steps [approve R + bridge] for bridging', async () => {
      vi.spyOn(AbiCoder.defaultAbiCoder(), 'encode').mockReturnValue('0x');
      vi.spyOn(CCIPRouter__factory, 'connect').mockReturnValue({
        getFee: vi.fn().mockResolvedValue(0n),
      } as never);
      (getTokenAllowance as Mock).mockResolvedValue(Decimal.ZERO);
      (buildTransactionWithGasLimit as Mock).mockResolvedValue({
        sendTransaction: vi.fn(),
        gasEstimate: Decimal.ZERO,
      });

      const bridge = new Bridge(mockEoaSigner);
      const steps = bridge.getBridgeRSteps('ethereum', 'base', new Decimal(100));

      const numberOfSteps = 2;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toStrictEqual({
        name: 'approve',
        token: 'R',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const secondStep = await steps.next();

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toStrictEqual({
        name: 'bridge',
      });
      expect(secondStep.value?.stepNumber).toEqual(2);
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const terminationStep = await steps.next();

      expect(terminationStep.done).toBe(true);
    });
  });
});
