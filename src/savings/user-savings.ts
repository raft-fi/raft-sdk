import { Signer, TransactionResponse } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { ERC20PermitSignatureStruct, RSavingsModule } from '../typechain/RSavingsModule';
import { R_TOKEN, TransactionWithFeesOptions } from '../types';
import { createEmptyPermitSignature, createPermitSignature, isEoaAddress, sendTransactionWithGasLimit } from '../utils';
import { ERC20, ERC20Permit, ERC20Permit__factory, RSavingsModule__factory } from '../typechain';
import { RaftConfig } from '../config';
import { getTokenAllowance } from '../allowance';

export interface ManageSavingsStepType {
  name: 'approve' | 'permit' | 'manageSavings';
}

export interface ManageSavingsOptions extends TransactionWithFeesOptions {
  frontendTag?: string;
}

export interface ManageSavingsStep {
  type: ManageSavingsStepType;
  stepNumber: number;
  numberOfSteps: number;
  action: () => Promise<TransactionResponse | ERC20PermitSignatureStruct>;
}

interface ManageSavingsStepsPrefetch {
  rTokenAllowance?: Decimal;
  rPermitSignature?: ERC20PermitSignatureStruct;
}

type PermitStep = {
  type: {
    name: 'permit';
  };
  stepNumber: number;
  numberOfSteps: number;
  action: () => Promise<ERC20PermitSignatureStruct>;
};

type ApproveStep = {
  type: {
    name: 'approve';
  };
  stepNumber: number;
  numberOfSteps: number;
  action: () => Promise<TransactionResponse>;
};

export class UserSavings {
  private userAddress: string;
  private user: Signer;
  private rToken: ERC20Permit;
  private rSavingsModuleContract: RSavingsModule;

  constructor(user: Signer) {
    this.user = user;
    this.userAddress = '';

    this.rToken = ERC20Permit__factory.connect(RaftConfig.networkConfig.tokens[R_TOKEN].address, this.user);
    this.rSavingsModuleContract = RSavingsModule__factory.connect(RaftConfig.networkConfig.rSavingsModule, this.user);
  }

  public async *getManageSavingsSteps(
    amount: Decimal,
    options: ManageSavingsOptions & ManageSavingsStepsPrefetch = {},
  ): AsyncGenerator<ManageSavingsStep, void, ERC20PermitSignatureStruct | undefined> {
    const { gasLimitMultiplier = Decimal.ONE, rPermitSignature: cachedRPermitSignature, frontendTag } = options;

    let { rTokenAllowance } = options;

    const userAddress = await this.getUserAddress();
    const isEoaSavingsOwner = await isEoaAddress(userAddress, this.user);
    const isSavingsIncrease = amount.gt(Decimal.ZERO);
    const rTokenAllowanceRequired = isSavingsIncrease;
    const canUsePermit = isEoaSavingsOwner;

    // In case the R token allowance check is not passed externally, check the allowance
    if (rTokenAllowance === undefined) {
      rTokenAllowance = rTokenAllowanceRequired
        ? await getTokenAllowance(this.rToken, userAddress, RaftConfig.networkConfig.rSavingsModule)
        : Decimal.MAX_DECIMAL;
    }

    const rTokenApprovalStepNeeded =
      rTokenAllowanceRequired && amount.gt(rTokenAllowance) && (!canUsePermit || !cachedRPermitSignature);

    const numberOfSteps = Number(rTokenApprovalStepNeeded) + 1;
    let stepCounter = 1;

    let rPermitSignature = createEmptyPermitSignature();
    if (rTokenApprovalStepNeeded) {
      rPermitSignature = yield* this.getApproveOrPermitStep(
        this.rToken,
        amount,
        RaftConfig.networkConfig.rSavingsModule,
        () => stepCounter++,
        numberOfSteps,
        canUsePermit,
        cachedRPermitSignature,
      );
    }

    // If amount is greater then zero, user wants to deposit, otherwise call withdraw
    let action;
    if (isSavingsIncrease) {
      if (canUsePermit) {
        action = () =>
          sendTransactionWithGasLimit(
            this.rSavingsModuleContract.depositWithPermit,
            [amount.abs().toBigInt(Decimal.PRECISION), userAddress, rPermitSignature],
            gasLimitMultiplier,
            frontendTag,
            this.user,
          );
      } else {
        action = () =>
          sendTransactionWithGasLimit(
            this.rSavingsModuleContract.deposit,
            [amount.abs().toBigInt(Decimal.PRECISION), userAddress],
            gasLimitMultiplier,
            frontendTag,
            this.user,
          );
      }
    } else {
      action = () =>
        sendTransactionWithGasLimit(
          this.rSavingsModuleContract.withdraw,
          [amount.abs().toBigInt(Decimal.PRECISION), userAddress, userAddress],
          gasLimitMultiplier,
          frontendTag,
          this.user,
        );
    }

    yield {
      type: {
        name: 'manageSavings',
      },
      stepNumber: stepCounter++,
      numberOfSteps,
      action: action,
    };
  }

  /**
   * Returns the address of the owner of the savings position.
   * @returns The address of the owner.
   */
  public async getUserAddress(): Promise<string> {
    if (this.userAddress === '') {
      this.userAddress = await this.user.getAddress();
    }

    return this.userAddress;
  }

  private *getSignTokenPermitStep(
    tokenContract: ERC20Permit,
    approveAmount: Decimal,
    spenderAddress: string,
    getStepNumber: () => number,
    numberOfSteps: number,
    cachedSignature?: ERC20PermitSignatureStruct,
  ): Generator<PermitStep, ERC20PermitSignatureStruct, ERC20PermitSignatureStruct | undefined> {
    const signature =
      cachedSignature ??
      (yield {
        type: {
          name: 'permit',
        },
        stepNumber: getStepNumber(),
        numberOfSteps,
        action: () => createPermitSignature(this.user, approveAmount, spenderAddress, tokenContract),
      });

    if (!signature) {
      throw new Error('R token permit signature is required');
    }

    return signature;
  }

  private *getApproveTokenStep(
    tokenContract: ERC20 | ERC20Permit,
    approveAmount: Decimal,
    spenderAddress: string,
    getStepNumber: () => number,
    numberOfSteps: number,
  ): Generator<ApproveStep, void, unknown> {
    yield {
      type: {
        name: 'approve',
      },
      stepNumber: getStepNumber(),
      numberOfSteps,
      action: () => tokenContract.approve(spenderAddress, approveAmount.toBigInt(Decimal.PRECISION)),
    };
  }

  private *getApproveOrPermitStep(
    tokenContract: ERC20 | ERC20Permit,
    approveAmount: Decimal,
    spenderAddress: string,
    getStepNumber: () => number,
    numberOfSteps: number,
    canUsePermit: boolean,
    cachedPermitSignature?: ERC20PermitSignatureStruct,
  ): Generator<PermitStep | ApproveStep, ERC20PermitSignatureStruct, ERC20PermitSignatureStruct | undefined> {
    let permitSignature = createEmptyPermitSignature();

    if (canUsePermit) {
      permitSignature = yield* this.getSignTokenPermitStep(
        tokenContract,
        approveAmount,
        spenderAddress,
        getStepNumber,
        numberOfSteps,
        cachedPermitSignature,
      );
    } else {
      yield* this.getApproveTokenStep(tokenContract, approveAmount, spenderAddress, getStepNumber, numberOfSteps);
    }

    return permitSignature;
  }
}
