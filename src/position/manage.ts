import { AddressLike, Signer, TransactionResponse } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import {
  CollateralToken,
  R_TOKEN,
  Token,
  Erc20TokenContract,
  TransactionWithFeesOptions,
  UnderlyingCollateralToken,
} from '../types';
import {
  EMPTY_PERMIT_SIGNATURE,
  buildTransactionWithGasLimit,
  getPermitOrApproveTokenStep,
  getPositionManagerContract,
  getTokenContract,
  getWhitelistStep,
  isEoaAddress,
  isInterestRateVault,
} from '../utils';
import { RaftConfig, SupportedCollateralTokens } from '../config';
import { getTokenAllowance } from '../allowance';
import { ERC20PermitSignatureStruct, PositionManager } from '../typechain/PositionManager';
import { ERC20, ERC20Permit, WstETH } from '../typechain';

export interface ManagePositionStepType {
  name: 'whitelist' | 'approve' | 'permit' | 'manage';
  token?: Token;
}

/**
 * Represents a step in managing a position.
 * @property type The type of the manage position step.
 * @property stepNumber The step number of the manage position step.
 * @property numberOfSteps The total number of steps in managing the position.
 * @property action The action to perform for the manage position step.
 */
export interface ManagePositionStep {
  type: ManagePositionStepType;
  stepNumber: number;
  numberOfSteps: number;
  action: () => Promise<TransactionResponse | ERC20PermitSignatureStruct>;
}

/**
 * Options for managing a position.
 * @property collateralToken The collateral token to use for the operation.
 * @property frontendTag The frontend operator tag for the transaction.
 * @property approvalType The approval type for the collateral token or R token. Smart contract position owners have to
 * use `approve` since they don't support signing. Defaults to permit.
 */
export interface ManagePositionOptions<C extends CollateralToken> extends TransactionWithFeesOptions {
  collateralToken?: C;
  frontendTag?: string;
  approvalType?: 'permit' | 'approve';
}

export interface ManagePositionStepsPrefetch {
  isDelegateWhitelisted?: boolean;
  collateralTokenAllowance?: Decimal;
  collateralPermitSignature?: ERC20PermitSignatureStruct;
  rTokenAllowance?: Decimal;
  rPermitSignature?: ERC20PermitSignatureStruct;
}

interface ManagePositionArgs {
  collateralToken: CollateralToken;
  collateralChange: Decimal;
  debtChange: Decimal;
  maxFeePercentage: Decimal;
  collateralPermitSignature: ERC20PermitSignatureStruct;
  rPermitSignature: ERC20PermitSignatureStruct;
  positionManagerAddress: string;
  gasLimitMultiplier: Decimal;
  frontendTag?: string;
}

interface NeededSteps {
  whitelistingStepNeeded: boolean;
  collateralApprovalStepNeeded: boolean;
  rTokenApprovalStepNeeded: boolean;
}

interface PermitChecks {
  canUserUsePermit: boolean;
  canCollateralTokenUsePermit: boolean;
}

export abstract class BasePositionManaging {
  protected readonly positionManager: PositionManager;
  protected readonly user: Signer;

  private readonly rToken: ERC20Permit;

  constructor(user: Signer) {
    this.positionManager = getPositionManagerContract('base', RaftConfig.networkConfig.positionManager, user);
    this.user = user;
    this.rToken = getTokenContract(R_TOKEN, user);
  }

  protected abstract getManagePositionAction(args: ManagePositionArgs): Promise<() => Promise<TransactionResponse>>;

  async *manage<U extends UnderlyingCollateralToken>(
    collateralChange: Decimal,
    debtChange: Decimal,
    underlyingCollateralToken: U,
    checkIfDelegateWhitelisted: (delegate: AddressLike) => Promise<boolean>,
    options: Required<ManagePositionOptions<SupportedCollateralTokens[U]>> & ManagePositionStepsPrefetch,
  ): AsyncGenerator<ManagePositionStep, void, ERC20PermitSignatureStruct | undefined> {
    const {
      collateralToken,
      collateralPermitSignature: cachedCollateralPermitSignature,
      rPermitSignature: cachedRPermitSignature,
      frontendTag,
      gasLimitMultiplier,
      maxFeePercentage,
    } = options;
    const collateralTokenContract = getTokenContract(collateralToken, this.user);
    const positionManagerAddress = RaftConfig.getPositionManagerAddress(underlyingCollateralToken, collateralToken);
    const permitChecks = await this.checkPermitSupport(options);
    const interestRateVault = isInterestRateVault(underlyingCollateralToken);
    const { whitelistingStepNeeded, collateralApprovalStepNeeded, rTokenApprovalStepNeeded } =
      await this.getNeededSteps(
        collateralChange,
        debtChange,
        collateralTokenContract,
        underlyingCollateralToken,
        positionManagerAddress,
        checkIfDelegateWhitelisted,
        permitChecks,
        options,
      );

    // The number of steps is the number of optional steps that are required based on input values plus one required
    // step (`manage`)
    const numberOfSteps =
      Number(whitelistingStepNeeded) + Number(collateralApprovalStepNeeded) + Number(rTokenApprovalStepNeeded) + 1;
    let stepCounter = 1;

    if (whitelistingStepNeeded) {
      yield* getWhitelistStep(this.positionManager, positionManagerAddress, stepCounter++, numberOfSteps, this.user);
    }

    const { canUserUsePermit, canCollateralTokenUsePermit } = permitChecks;
    let collateralPermitSignature = EMPTY_PERMIT_SIGNATURE;

    if (collateralApprovalStepNeeded) {
      collateralPermitSignature = yield* getPermitOrApproveTokenStep(
        this.user,
        collateralToken,
        collateralTokenContract,
        collateralChange,
        positionManagerAddress,
        stepCounter++,
        numberOfSteps,
        canUserUsePermit && canCollateralTokenUsePermit,
        cachedCollateralPermitSignature,
      );
    }

    let rPermitSignature = EMPTY_PERMIT_SIGNATURE;

    if (rTokenApprovalStepNeeded) {
      rPermitSignature = yield* getPermitOrApproveTokenStep(
        this.user,
        R_TOKEN,
        this.rToken,
        debtChange.abs(),
        positionManagerAddress,
        stepCounter++,
        numberOfSteps,
        // Interest rate vaults don't support signing permit for R token
        canUserUsePermit && !interestRateVault,
        cachedRPermitSignature,
      );
    }

    yield {
      type: {
        name: 'manage',
      },
      stepNumber: stepCounter++,
      numberOfSteps,
      action: await this.getManagePositionAction({
        collateralToken,
        collateralChange,
        debtChange,
        maxFeePercentage,
        collateralPermitSignature,
        rPermitSignature,
        positionManagerAddress,
        gasLimitMultiplier,
        frontendTag,
      }),
    };
  }

  private async checkPermitSupport<U extends UnderlyingCollateralToken>(
    options: Required<ManagePositionOptions<SupportedCollateralTokens[U]>> & ManagePositionStepsPrefetch,
  ): Promise<PermitChecks> {
    const { collateralToken, approvalType = 'permit' } = options;
    const isEoaPositionOwner = await isEoaAddress(this.user, this.user);
    const collateralTokenConfig = RaftConfig.networkConfig.tokens[collateralToken as Token];

    return {
      canUserUsePermit: isEoaPositionOwner && approvalType === 'permit',
      canCollateralTokenUsePermit: collateralTokenConfig.supportsPermit,
    };
  }

  private async getNeededSteps<U extends UnderlyingCollateralToken>(
    collateralChange: Decimal,
    debtChange: Decimal,
    collateralTokenContract: Erc20TokenContract,
    underlyingCollateralToken: U,
    positionManagerAddress: string,
    checkIfDelegateWhitelisted: (delegate: AddressLike) => Promise<boolean>,
    permitChecks: PermitChecks,
    options: Required<ManagePositionOptions<SupportedCollateralTokens[U] | U>> & ManagePositionStepsPrefetch,
  ): Promise<NeededSteps> {
    const { collateralToken } = options;
    const isCollateralIncrease = collateralChange.gt(Decimal.ZERO);
    const isDebtIncrease = debtChange.gt(Decimal.ZERO);
    const isUnderlyingToken = collateralToken === underlyingCollateralToken;
    const interestRateVault = isInterestRateVault(underlyingCollateralToken);

    const { collateralPermitSignature: cachedCollateralPermitSignature, rPermitSignature: cachedRPermitSignature } =
      options;
    let { isDelegateWhitelisted, collateralTokenAllowance, rTokenAllowance } = options;

    const whitelistingRequired = !isUnderlyingToken;
    const collateralTokenAllowanceRequired = collateralTokenContract !== null && isCollateralIncrease;
    const rTokenAllowanceRequired =
      (!interestRateVault && !isDebtIncrease && !isUnderlyingToken) || (interestRateVault && !isDebtIncrease);

    // In case the delegate whitelisting check is not passed externally, check the whitelist status
    if (isDelegateWhitelisted === undefined) {
      isDelegateWhitelisted = whitelistingRequired ? await checkIfDelegateWhitelisted(positionManagerAddress) : false;
    }

    // In case the collateral token allowance check is not passed externally, check the allowance
    if (collateralTokenAllowance === undefined) {
      collateralTokenAllowance = collateralTokenAllowanceRequired
        ? await getTokenAllowance(collateralToken, collateralTokenContract, this.user, positionManagerAddress)
        : Decimal.MAX_DECIMAL;
    }

    // In case the R token allowance check is not passed externally, check the allowance
    if (rTokenAllowance === undefined) {
      rTokenAllowance = rTokenAllowanceRequired
        ? await getTokenAllowance(R_TOKEN, this.rToken, this.user, positionManagerAddress)
        : Decimal.MAX_DECIMAL;
    }

    const { canUserUsePermit, canCollateralTokenUsePermit } = permitChecks;

    return {
      whitelistingStepNeeded: whitelistingRequired && !isDelegateWhitelisted,
      collateralApprovalStepNeeded:
        // action needs collateral token allowance check
        collateralTokenAllowanceRequired &&
        // current allowance is not enough
        collateralChange.gt(collateralTokenAllowance ?? Decimal.ZERO) &&
        // approval step or signing a permit is needed
        (!canUserUsePermit || !canCollateralTokenUsePermit || !cachedCollateralPermitSignature),
      rTokenApprovalStepNeeded:
        // action needs R token allowance check
        rTokenAllowanceRequired &&
        // current allowance is not enough
        debtChange.abs().gt(rTokenAllowance ?? Decimal.ZERO) &&
        // approval step or signing a permit is needed
        (!canUserUsePermit || !cachedRPermitSignature),
    };
  }

  protected getAbsValueAndIsIncrease(value: Decimal): [bigint, boolean] {
    return [value.abs().value, value.gt(Decimal.ZERO)];
  }
}

export class InterestRatePositionManaging extends BasePositionManaging {
  protected async getManagePositionAction(args: ManagePositionArgs): Promise<() => Promise<TransactionResponse>> {
    const {
      collateralToken,
      collateralChange,
      debtChange,
      maxFeePercentage,
      collateralPermitSignature,
      gasLimitMultiplier,
      frontendTag,
    } = args;
    const method = getPositionManagerContract(
      'interest-rate',
      RaftConfig.networkConfig.interestRatePositionManager,
      this.user,
    ).managePosition;

    const { sendTransaction } = await buildTransactionWithGasLimit(
      method,
      [
        RaftConfig.getTokenAddress(collateralToken),
        this.user,
        ...this.getAbsValueAndIsIncrease(collateralChange),
        ...this.getAbsValueAndIsIncrease(debtChange),
        maxFeePercentage.value,
        collateralPermitSignature,
      ],
      this.user,
      gasLimitMultiplier,
      frontendTag,
    );

    return sendTransaction;
  }
}

export class UnderlyingCollateralTokenPositionManaging extends BasePositionManaging {
  protected async getManagePositionAction(args: ManagePositionArgs): Promise<() => Promise<TransactionResponse>> {
    const {
      collateralToken,
      collateralChange,
      debtChange,
      maxFeePercentage,
      collateralPermitSignature,
      gasLimitMultiplier,
      frontendTag,
    } = args;

    const { sendTransaction } = await buildTransactionWithGasLimit(
      this.positionManager.managePosition,
      [
        RaftConfig.getTokenAddress(collateralToken),
        this.user,
        ...this.getAbsValueAndIsIncrease(collateralChange),
        ...this.getAbsValueAndIsIncrease(debtChange),
        maxFeePercentage.value,
        collateralPermitSignature,
      ],
      this.user,
      gasLimitMultiplier,
      frontendTag,
    );

    return sendTransaction;
  }
}

export class WrappableCappedCollateralTokenPositionManaging extends BasePositionManaging {
  protected async getManagePositionAction(args: ManagePositionArgs): Promise<() => Promise<TransactionResponse>> {
    const {
      collateralChange,
      debtChange,
      maxFeePercentage,
      rPermitSignature,
      positionManagerAddress,
      gasLimitMultiplier,
      frontendTag,
    } = args;

    const { sendTransaction } = await buildTransactionWithGasLimit(
      getPositionManagerContract('wrapped', positionManagerAddress, this.user).managePosition,
      [
        ...this.getAbsValueAndIsIncrease(collateralChange),
        ...this.getAbsValueAndIsIncrease(debtChange),
        maxFeePercentage.value,
        rPermitSignature,
      ],
      this.user,
      gasLimitMultiplier,
      frontendTag,
    );

    return sendTransaction;
  }
}

export class StEthPositionManaging extends BasePositionManaging {
  protected async getManagePositionAction(args: ManagePositionArgs): Promise<() => Promise<TransactionResponse>> {
    const {
      collateralChange,
      debtChange,
      maxFeePercentage,
      rPermitSignature,
      positionManagerAddress,
      gasLimitMultiplier,
      frontendTag,
    } = args;

    const { sendTransaction } = await buildTransactionWithGasLimit(
      getPositionManagerContract('stETH', positionManagerAddress, this.user).managePositionStETH,
      [
        ...this.getAbsValueAndIsIncrease(collateralChange),
        ...this.getAbsValueAndIsIncrease(debtChange),
        maxFeePercentage.value,
        rPermitSignature,
      ],
      this.user,
      gasLimitMultiplier,
      frontendTag,
    );

    return sendTransaction;
  }
}
