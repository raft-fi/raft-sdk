import { Decimal } from '@tempusfinance/decimal';
import { AbiCoder, Signer } from 'ethers';
import { Bridge, getTokenAllowance } from '../src';
import { CCIPRouter__factory } from '../src/typechain';
import { buildTransactionWithGasLimit } from '../src/utils';

const mockEoaSigner = {
  provider: {
    getCode: () => Promise.resolve('0x'),
  },
  getAddress: () => Promise.resolve('0x123'),
} as unknown as Signer;

jest.mock('../src/allowance', () => ({
  ...jest.requireActual('../src/allowance'),
  getTokenAllowance: jest.fn(),
}));

jest.mock('../src/bridge', () => ({
  ...jest.requireActual('../src/bridge'),
  getSourceChainRouterContract: jest.fn(),
}));

jest.mock('../src/utils/transactions', () => ({
  ...jest.requireActual('../src/utils/transactions'),
  buildTransactionWithGasLimit: jest.fn(),
}));

describe('Bridge', () => {
  describe('getBridgeRSteps', () => {
    it('should generate steps [approve R + bridge] for bridging', async () => {
      jest.spyOn(AbiCoder.defaultAbiCoder(), 'encode').mockReturnValue('0x');
      jest.spyOn(CCIPRouter__factory, 'connect').mockReturnValue({
        getFee: jest.fn().mockResolvedValue(0n),
      } as never);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);
      (buildTransactionWithGasLimit as jest.Mock).mockResolvedValue({
        sendTransaction: jest.fn(),
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
