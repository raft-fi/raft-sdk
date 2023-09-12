import { Decimal } from '@tempusfinance/decimal';
import { Signer } from 'ethers';
import { ERC20PermitSignatureStruct, UserPosition, getTokenAllowance } from '../../src';
import { createPermitSignature, EMPTY_PERMIT_SIGNATURE, getPositionManagerContract } from '../../src/utils';
import { VaultV1 } from '../../src/types';

jest.mock('../../src/allowance', () => ({
  ...jest.requireActual('../../src/allowance'),
  getTokenAllowance: jest.fn(),
}));

jest.mock('../../src/utils/permit', () => ({
  ...jest.requireActual('../../src/utils/permit'),
  createPermitSignature: jest.fn(),
}));

jest.mock('../../src/utils/position-manager', () => ({
  ...jest.requireActual('../../src/utils/position-manager'),
  getPositionManagerContract: jest.fn(),
}));

const mockEoaSigner = {
  provider: {
    getCode: () => Promise.resolve('0x'),
  },
  getAddress: () => Promise.resolve('0x123'),
} as unknown as Signer;

describe('UserPosition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  describe('getManageSteps', () => {
    it('should fetch whitelist and allowance if they are not passed and required', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH-v1');
      const steps = userPosition.getManageSteps(Decimal.ONE, new Decimal(-1), { collateralToken: 'stETH' });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value).toBeDefined();
      expect(isDelegateWhitelistedMock).toHaveBeenCalledTimes(1);
      expect(getTokenAllowance).toHaveBeenCalledTimes(2);
    });

    it('should skip whitelist and allowance fetching if they are passed', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, Decimal.ONE, {
        isDelegateWhitelisted: false,
        collateralTokenAllowance: Decimal.ONE,
        rTokenAllowance: Decimal.ONE,
      });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);
      (getPositionManagerContract as jest.Mock).mockResolvedValue({
        managePosition: null,
      });

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value).toBeDefined();
      expect(isDelegateWhitelistedMock).not.toHaveBeenCalled();
      expect(getTokenAllowance).not.toHaveBeenCalled();
    });

    it('should generate steps [wstETH permit + manage] for wstETH deposit + R borrowing', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, Decimal.ONE, { collateralToken: 'wstETH' });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as jest.Mock).mockResolvedValue(EMPTY_PERMIT_SIGNATURE);
      (getPositionManagerContract as jest.Mock).mockResolvedValue({
        managePosition: null,
      });

      const numberOfSteps = 2;

      const firstStep = await steps.next();
      const signature = await firstStep.value?.action?.();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'permit',
        token: 'wstETH',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);
      expect(signature).toEqual(EMPTY_PERMIT_SIGNATURE);

      const secondStep = await steps.next(signature as ERC20PermitSignatureStruct);

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toEqual({
        name: 'manage',
      });
      expect(secondStep.value?.stepNumber).toEqual(2);
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should generate steps [approve wstETH + manage] for wstETH deposit + R borrowing in case of approval type config', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, Decimal.ONE, {
        collateralToken: 'wstETH',
        approvalType: 'approve',
      });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as jest.Mock).mockResolvedValue(EMPTY_PERMIT_SIGNATURE);
      (getPositionManagerContract as jest.Mock).mockResolvedValue({
        managePosition: null,
      });

      const numberOfSteps = 2;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'approve',
        token: 'wstETH',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const secondStep = await steps.next();

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toEqual({
        name: 'manage',
      });
      expect(secondStep.value?.stepNumber);
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should generate steps [wstETH permit + manage] for wstETH deposit + R repayment', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH-v1');
      const steps = userPosition.getManageSteps(Decimal.ONE, new Decimal(-1), { collateralToken: 'wstETH-v1' });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as jest.Mock).mockResolvedValue(EMPTY_PERMIT_SIGNATURE);

      const numberOfSteps = 2;

      const firstStep = await steps.next();
      const signature = await firstStep.value?.action?.();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'permit',
        token: 'wstETH-v1',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);
      expect(signature).toEqual(EMPTY_PERMIT_SIGNATURE);

      const secondStep = await steps.next(signature as ERC20PermitSignatureStruct);

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toEqual({
        name: 'manage',
      });
      expect(secondStep.value?.stepNumber);
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should generate steps [manage] for wstETH withdrawal + R borrowing', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(new Decimal(-1), Decimal.ONE, { collateralToken: 'wstETH' });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);
      (getPositionManagerContract as jest.Mock).mockResolvedValue({
        managePosition: null,
      });

      const numberOfSteps = 1;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'manage',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should generate steps [manage] for wstETH withdrawal + R repayment', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH-v1');
      const steps = userPosition.getManageSteps(new Decimal(-1), new Decimal(-1), { collateralToken: 'wstETH-v1' });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);

      const numberOfSteps = 1;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'manage',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it.each([
      ['wstETH-v1', 'stETH'],
      ['wcrETH', 'rETH'],
    ] as [VaultV1, 'stETH' | 'rETH'][])(
      'should generate steps [whitelist + approve collateral + permit R + manage] for %s deposit + R repayment',
      async (underlyingCollateralToken: VaultV1, collateralToken: 'stETH' | 'rETH') => {
        const userPosition = new UserPosition(mockEoaSigner, underlyingCollateralToken);
        const steps = userPosition.getManageSteps(Decimal.ONE, new Decimal(-1), {
          collateralToken,
        });

        const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

        jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
        (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);
        (createPermitSignature as jest.Mock).mockResolvedValue(EMPTY_PERMIT_SIGNATURE);

        const numberOfSteps = 4;

        const firstStep = await steps.next();

        expect(firstStep.done).toBe(false);
        expect(firstStep.value?.type).toEqual({
          name: 'whitelist',
        });
        expect(firstStep.value?.stepNumber).toEqual(1);
        expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

        const secondStep = await steps.next();

        expect(secondStep.done).toBe(false);
        expect(secondStep.value?.type).toEqual({
          name: 'approve',
          token: collateralToken,
        });
        expect(secondStep.value?.stepNumber);
        expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

        const thirdStep = await steps.next();
        const signature = await thirdStep.value?.action?.();

        expect(thirdStep.done).toBe(false);
        expect(thirdStep.value?.type).toEqual({
          name: 'permit',
          token: 'R',
        });
        expect(thirdStep.value?.stepNumber).toEqual(3);
        expect(thirdStep.value?.numberOfSteps).toEqual(numberOfSteps);
        expect(signature).toEqual(EMPTY_PERMIT_SIGNATURE);

        const fourthStep = await steps.next(signature as ERC20PermitSignatureStruct);

        expect(fourthStep.done).toBe(false);
        expect(fourthStep.value?.type).toEqual({
          name: 'manage',
        });
        expect(fourthStep.value?.stepNumber).toEqual(4);
        expect(fourthStep.value?.numberOfSteps).toEqual(numberOfSteps);

        const termination = await steps.next();

        expect(termination.done).toBe(true);
      },
    );

    it.each([
      ['wstETH-v1', 'stETH'],
      ['wcrETH', 'rETH'],
    ] as [VaultV1, 'stETH' | 'rETH'][])(
      'should generate steps [whitelist + permit R + manage] for %s withdrawal + R repayment',
      async (underlyingCollateralToken: VaultV1, collateralToken: 'stETH' | 'rETH') => {
        const userPosition = new UserPosition(mockEoaSigner, underlyingCollateralToken);
        const steps = userPosition.getManageSteps(new Decimal(-1), new Decimal(-1), {
          collateralToken,
        });

        const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

        jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
        (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);
        (createPermitSignature as jest.Mock).mockResolvedValue(EMPTY_PERMIT_SIGNATURE);

        const numberOfSteps = 3;

        const firstStep = await steps.next();

        expect(firstStep.done).toBe(false);
        expect(firstStep.value?.type).toEqual({
          name: 'whitelist',
        });
        expect(firstStep.value?.stepNumber).toEqual(1);
        expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

        const secondStep = await steps.next();
        const signature = await secondStep.value?.action?.();

        expect(secondStep.done).toBe(false);
        expect(secondStep.value?.type).toEqual({
          name: 'permit',
          token: 'R',
        });
        expect(secondStep.value?.stepNumber);
        expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);
        expect(signature).toEqual(EMPTY_PERMIT_SIGNATURE);

        const thirdStep = await steps.next(signature as ERC20PermitSignatureStruct);

        expect(thirdStep.done).toBe(false);
        expect(thirdStep.value?.type).toEqual({
          name: 'manage',
        });
        expect(thirdStep.value?.stepNumber).toEqual(3);
        expect(thirdStep.value?.numberOfSteps).toEqual(numberOfSteps);

        const termination = await steps.next();

        expect(termination.done).toBe(true);
      },
    );

    it('should generate steps [approve collateral + manage] for WETH deposit + R borrowing', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'WETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, Decimal.ONE, { collateralToken: 'WETH' });

      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);
      (getPositionManagerContract as jest.Mock).mockResolvedValue({
        managePosition: null,
      });

      const numberOfSteps = 2;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'approve',
        token: 'WETH',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const secondStep = await steps.next();

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toEqual({
        name: 'manage',
      });
      expect(secondStep.value?.stepNumber).toEqual(2);
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should generate steps [approve collateral + manage] for WETH deposit + R repayment', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'WETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, new Decimal(-1), { collateralToken: 'WETH' });

      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);
      (getPositionManagerContract as jest.Mock).mockResolvedValue({
        managePosition: null,
      });

      const numberOfSteps = 2;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'approve',
        token: 'WETH',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const secondStep = await steps.next();

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toEqual({
        name: 'manage',
      });
      expect(secondStep.value?.stepNumber).toEqual(2);
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should generate steps [manage] for WETH withdrawal + R borrowing', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'WETH');
      const steps = userPosition.getManageSteps(new Decimal(-1), Decimal.ONE, { collateralToken: 'WETH' });

      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);
      (getPositionManagerContract as jest.Mock).mockResolvedValue({
        managePosition: null,
      });

      const numberOfSteps = 1;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'manage',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should generate steps [manage] for WETH withdrawal + R repayment', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'WETH');
      const steps = userPosition.getManageSteps(new Decimal(-1), new Decimal(-1), { collateralToken: 'WETH' });

      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);
      (getPositionManagerContract as jest.Mock).mockResolvedValue({
        managePosition: null,
      });

      const numberOfSteps = 1;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'manage',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should skip using delegate if there is no collateral change', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH-v1');
      const steps = userPosition.getManageSteps(Decimal.ZERO, new Decimal(-1), { collateralToken: 'stETH' });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);
      (getPositionManagerContract as jest.Mock).mockResolvedValue({
        managePosition: null,
      });

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).not.toEqual({
        name: 'whitelist',
      });
    });

    it('should skip permit step if cached collateral token permit signature is passed', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, Decimal.ONE, {
        collateralToken: 'wstETH',
        collateralPermitSignature: EMPTY_PERMIT_SIGNATURE,
      });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as jest.Mock).mockResolvedValue(EMPTY_PERMIT_SIGNATURE);
      (getPositionManagerContract as jest.Mock).mockResolvedValue({
        managePosition: null,
      });

      const numberOfSteps = 1;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'manage',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should skip permit step if cached R token permit signature is passed', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH-v1');
      const steps = userPosition.getManageSteps(new Decimal(-1), new Decimal(-1), {
        collateralToken: 'stETH',
        rPermitSignature: EMPTY_PERMIT_SIGNATURE,
      });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as jest.Mock).mockResolvedValue(EMPTY_PERMIT_SIGNATURE);

      const numberOfSteps = 2;

      const firstStep = await steps.next();

      expect(firstStep.done).toBe(false);
      expect(firstStep.value?.type).toEqual({
        name: 'whitelist',
      });
      expect(firstStep.value?.stepNumber).toEqual(1);
      expect(firstStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const secondStep = await steps.next();

      expect(secondStep.done).toBe(false);
      expect(secondStep.value?.type).toEqual({
        name: 'manage',
      });
      expect(secondStep.value?.stepNumber).toEqual(2);
      expect(secondStep.value?.numberOfSteps).toEqual(numberOfSteps);

      const termination = await steps.next();

      expect(termination.done).toBe(true);
    });

    it('should throw an error if collateral and debt changes are both zero', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH-v1');
      const steps = userPosition.getManageSteps(Decimal.ZERO, Decimal.ZERO);

      expect(() => steps.next()).rejects.toThrow('Collateral and debt change cannot be both zero');
    });

    it('should throw an error if collateral token permit signature is not passed', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH');
      const steps = userPosition.getManageSteps(Decimal.ONE, Decimal.ONE, { collateralToken: 'wstETH' });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as jest.Mock).mockResolvedValue(EMPTY_PERMIT_SIGNATURE);

      await steps.next();

      expect(() => steps.next()).rejects.toThrow('stETH permit signature is required');
    });

    it('should throw an error if R token permit signature is not passed', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH-v1');
      const steps = userPosition.getManageSteps(new Decimal(-1), new Decimal(-1), { collateralToken: 'stETH' });

      const isDelegateWhitelistedMock = jest.fn().mockResolvedValue(false);

      jest.spyOn(userPosition, 'isDelegateWhitelisted').mockImplementation(isDelegateWhitelistedMock);
      (getTokenAllowance as jest.Mock).mockResolvedValue(Decimal.ZERO);
      (createPermitSignature as jest.Mock).mockResolvedValue(EMPTY_PERMIT_SIGNATURE);

      await steps.next();
      await steps.next();

      expect(() => steps.next()).rejects.toThrow('R permit signature is required');
    });

    it('should not allow opening a position for v1 vaults', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH-v1');
      const steps = userPosition.getManageSteps(Decimal.ONE, Decimal.ONE, { collateralToken: 'wstETH-v1' });

      await expect(steps.next()).rejects.toThrow('Cannot borrow more debt from v1 vaults');
    });

    it('should not allow borrowing more debt from v1 vaults', async () => {
      const userPosition = new UserPosition(mockEoaSigner, 'wstETH-v1', new Decimal(100), new Decimal(3000));
      const steps = userPosition.getManageSteps(Decimal.ZERO, new Decimal(100), { collateralToken: 'wstETH-v1' });

      await expect(steps.next()).rejects.toThrow('Cannot borrow more debt from v1 vaults');
    });
  });
});
