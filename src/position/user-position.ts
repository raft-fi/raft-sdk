import { Decimal } from '@tempusfinance/decimal';
import { Signer, ContractTransactionResponse, TransactionResponse, ethers } from 'ethers';
import { request, gql } from 'graphql-request';
import { getTokenAllowance } from '../allowance';
import { RaftConfig, SupportedCollateralTokens } from '../config';
import { PriceFeed } from '../price';
import { PositionManager, OneInchOneStepLeverageStETH__factory, OneInchOneStepLeverageStETH } from '../typechain';
import OneInchOneStepLeverageStETHABI from './../abi/OneInchOneStepLeverageStETH.json';
import { ERC20PermitSignatureStruct } from '../typechain/PositionManager';
import {
  CollateralToken,
  SupportedVaultVersionUnderlyingCollateralTokens,
  SwapRouter,
  Token,
  TransactionWithFeesOptions,
  VaultVersion,
} from '../types';
import {
  getPositionManagerContract,
  getTokenContract,
  isUnderlyingCollateralToken,
  isWrappableCappedCollateralToken,
  sendTransactionWithGasLimit,
} from '../utils';
import { PositionWithRunner } from './base';
import { SWAP_ROUTER_MAX_SLIPPAGE } from '../constants';
import { Protocol } from '../protocol';
import {
  BasePositionManaging,
  InterestRatePositionManaging,
  ManagePositionOptions,
  ManagePositionStep,
  ManagePositionStepsPrefetch,
  StEthPositionManaging,
  UnderlyingCollateralTokenPositionManaging,
  WrappableCappedCollateralTokenPositionManaging,
} from './manage';
import { getPermitOrApproveTokenStep, getWhitelistStep } from './steps';

export interface LeveragePositionStepType {
  name: 'whitelist' | 'approve' | 'permit' | 'leverage';
  token?: Token;
}

interface LeveragePositionStepsPrefetch {
  isDelegateWhitelisted?: boolean;
  currentDebt?: Decimal;
  currentCollateral?: Decimal;
  collateralTokenAllowance?: Decimal;
  underlyingRate?: Decimal;
  borrowRate?: Decimal;
  underlyingCollateralPrice?: Decimal;
}

export interface LeveragePositionStep {
  type: LeveragePositionStepType;
  stepNumber: number;
  numberOfSteps: number;
  action: () => Promise<TransactionResponse | ERC20PermitSignatureStruct>;
}

interface UserPositionResponse {
  underlyingCollateralToken: string | null;
  isLeveraged: boolean | null;
  vaultVersion: VaultVersion | null;
}

const DEBT_CHANGE_TO_CLOSE = Decimal.MAX_DECIMAL.mul(-1);

/**
 * Options for leveraging a position.
 * @property collateralToken The collateral token to use for the operation.
 * @property frontendTag The frontend operator tag for the transaction.
 * @property approvalType The approval type for the collateral token. Smart contract position owners have to
 * use `approve` since they don't support signing. Defaults to permit.
 * @property swapRouter Swap router that swap will use for the operation
 */
export interface LeveragePositionOptions<C extends CollateralToken> extends TransactionWithFeesOptions {
  collateralToken?: C;
  frontendTag?: string;
  approvalType?: 'permit' | 'approve';
  swapRouter?: SwapRouter;
}

/**
 * Callbacks for managing a position.
 * @property onDelegateWhitelistingStart A callback that is called when the delegate whitelisting starts.
 * @property onDelegateWhitelistingEnd A callback that is called when the delegate whitelisting ends.
 * @property onApprovalStart A callback that is called when the collateral token or R approval starts.
 * @property onApprovalEnd A callback that is called when the approval ends.
 */
export interface ManagePositionCallbacks {
  onDelegateWhitelistingStart?: () => void;
  onDelegateWhitelistingEnd?: (error?: unknown) => void;
  onApprovalStart?: () => void;
  onApprovalEnd?: (error?: unknown) => void;
}

/**
 * A position with an attached signer that is the position's owner. This class is used for operations that modify the
 * position (e.g. managing collateral and debt). For read-only operations on the position, use the
 * {@link PositionWithAddress} class.
 */
export class UserPosition<
  V extends VaultVersion,
  T extends SupportedVaultVersionUnderlyingCollateralTokens[V],
> extends PositionWithRunner {
  private user: Signer;
  private positionManager: PositionManager;
  private vaultVersion: V;

  /**
   * Fetches the position of a given user or returns null if the user does not have a position. Differs from the
   * constructor in that it fetches the underlying collateral token of the position and checks whether it is valid,
   * where it is required to know the position's underlying collateral token when calling the constructor.
   * @param user The signer of the position's owner.
   * @returns The position of the user or null.
   */
  public static async fromUser<C extends SupportedVaultVersionUnderlyingCollateralTokens[VaultVersion]>(
    user: Signer,
  ): Promise<UserPosition<VaultVersion, C> | null> {
    const query = gql`
      query getPosition($positionId: String!) {
        position(id: $positionId) {
          underlyingCollateralToken
          isLeveraged
          vaultVersion
        }
      }
    `;
    const variables = {
      positionId: (await user.getAddress()).toLowerCase(),
    };

    const response = await request<{ position: UserPositionResponse | null }>(
      RaftConfig.subgraphEndpoint,
      query,
      variables,
    );
    const underlyingCollateralTokenAddress = response.position?.underlyingCollateralToken;

    if (!underlyingCollateralTokenAddress) {
      return null;
    }

    const underlyingCollateralToken = RaftConfig.getTokenTicker(underlyingCollateralTokenAddress);

    if (underlyingCollateralToken === null || !isUnderlyingCollateralToken(underlyingCollateralToken)) {
      return null;
    }

    const isLeveraged = response.position?.isLeveraged ?? false;
    const vaultVersion = response.position?.vaultVersion ?? 'v2';

    // TODO: support v2 vaults
    const position = new UserPosition(
      user,
      underlyingCollateralToken as SupportedVaultVersionUnderlyingCollateralTokens[VaultVersion],
      vaultVersion,
    );
    position.setIsLeveraged(isLeveraged);
    await position.fetch();

    return position;
  }

  /**
   * Creates a new representation of a position or a given user with given initial collateral and debt amounts.
   * @param user The signer of the position's owner.
   * @param underlyingCollateralToken The underlying collateral token.
   * @param collateral The collateral amount. Defaults to 0.
   * @param debt The debt amount. Defaults to 0.
   */
  public constructor(
    user: Signer,
    underlyingCollateralToken: T,
    vaultVersion: V = 'v2' as V,
    collateral: Decimal = Decimal.ZERO,
    debt: Decimal = Decimal.ZERO,
  ) {
    super('', user, underlyingCollateralToken, collateral, debt);

    this.user = user;
    this.positionManager = getPositionManagerContract('base', RaftConfig.networkConfig.positionManager, user);
    this.vaultVersion = vaultVersion;
  }

  public getVaultVersion(): V {
    return this.vaultVersion;
  }

  /**
   * Manages the position's collateral and debt amounts by depositing or withdrawing from the position manager. Does not
   * fetch the position's collateral and debt amounts after the operation. In case of adding collateral more collateral,
   * it checks whether the collateral token allowance is sufficient and if not, it asks the user to approve the
   * collateral change.
   *
   * This method is used as a generic method for managing the position's collateral and debt amounts. For more specific
   * methods, use the {@link UserPosition.open}, {@link UserPosition.close}, {@link UserPosition.addCollateral},
   * {@link UserPosition.withdrawCollateral}, {@link UserPosition.borrow}, and {@link UserPosition.repayDebt}.
   * @param collateralChange The amount to change the collateral by. Positive values deposit collateral, negative values
   * withdraw collateral.
   *
   * For more granular control over the transaction, use {@link getManageSteps} instead.
   * @param collateralChange The amount of collateral to deposit. Positive values deposit collateral, negative values
   * withdraw it.
   * @param debtChange The amount to change the debt by. Positive values borrow debt, negative values repay debt.
   * @param options.maxFeePercentage The maximum fee percentage to pay for the operation. Defaults to 1 (100%).
   * @param options.collateralToken The collateral token to use for the operation. Defaults to the position's underlying
   * collateral token.
   * @param options.gasLimitMultiplier The multiplier for the gas limit of the transaction. Defaults to 1.
   * @param options.frontendTag The frontend operator tag for the transaction. Optional.
   * @param options.approvalType The approval type for the collateral token or R token. Smart contract position owners
   * have to use `approve` since they don't support signing. Defaults to permit.
   * @param options.onDelegateWhitelistingStart A callback that is called when the delegate whitelisting starts.
   * Optional.
   * @param options.onDelegateWhitelistingEnd A callback that is called when the delegate whitelisting ends. Optional.
   * @param options.onApprovalStart A callback that is called when the collateral token or R approval starts. If
   * approval is not needed, the callback will never be called. Optional.
   * @param options.onApprovalEnd A callback that is called when the approval ends. Optional.
   * @throws If the collateral change is negative and the collateral token is ETH.
   */
  public async manage(
    collateralChange: Decimal,
    debtChange: Decimal,
    options: ManagePositionOptions<SupportedCollateralTokens[T]> & ManagePositionCallbacks = {},
  ): Promise<void> {
    const { onDelegateWhitelistingStart, onDelegateWhitelistingEnd, onApprovalStart, onApprovalEnd, ...otherOptions } =
      options;

    const steps = this.getManageSteps(collateralChange, debtChange, otherOptions);
    let collateralPermitSignature: ERC20PermitSignatureStruct | undefined;

    for (let step = await steps.next(); !step.done; step = await steps.next(collateralPermitSignature)) {
      const { type: stepType, action } = step.value;

      switch (stepType.name) {
        case 'whitelist':
          onDelegateWhitelistingStart?.();
          break;

        case 'manage':
          break;

        default:
          onApprovalStart?.();
      }

      const result = await action();

      if (result instanceof TransactionResponse) {
        await result.wait();
        collateralPermitSignature = undefined;

        switch (stepType.name) {
          case 'whitelist':
            onDelegateWhitelistingEnd?.();
            break;

          case 'manage':
            break;

          default:
            onApprovalEnd?.();
        }
      } else {
        collateralPermitSignature = result;
      }
    }
  }

  /**
   * Returns the steps for managing the position's collateral and debt amounts. The steps are not dispatched
   * automatically and it is the caller's response to dispatch them. Each step contains the type of the step, the total
   * number of steps, and the action to perform. The action is either a transaction to dispatch or a function that
   * returns a permit signature for the collateral token or R token.
   * @param collateralChange The amount of change the collateral by. Positive values deposit collateral, negative values
   * withdraw it.
   * @param debtChange The amount to change the debt by. Positive values borrow debt, negative values repay debt.
   * @param options.maxFeePercentage The maximum fee percentage to pay for the operation. Defaults to 1 (100%).
   * @param options.collateralToken The collateral token to use for the operation. Defaults to the position's underlying
   * collateral token.
   * @param options.gasLimitMultiplier The multiplier for the gas limit of the transaction. Defaults to 1.
   * @param options.frontendTag The frontend operator tag for the transaction. Optional.
   * @param options.approvalType The approval type for the collateral token or R token. Smart contract position owners
   * have to use `approve` since they don't support signing. Defaults to permit.
   * @param options.isDelegateWhitelisted Whether the delegate is whitelisted for the position owner. If not provided,
   * it will be fetched automatically.
   * @param options.collateralTokenAllowance The collateral token allowance of the position owner for the position
   * manager. If not provided, it will be fetched automatically.
   * @param options.collateralPermitSignature The collateral token permit signature. If not provided, it will be asked
   * from the user.
   * @param options.rTokenAllowance The R token allowance of the position owner for the position manager. If not
   * provided, it will be fetched automatically.
   * @param options.rPermitSignature The R token permit signature. If not provided, it will be asked from the user.
   */
  public async *getManageSteps(
    collateralChange: Decimal,
    debtChange: Decimal,
    options: ManagePositionOptions<SupportedCollateralTokens[T]> & ManagePositionStepsPrefetch = {},
  ): AsyncGenerator<ManagePositionStep, void, ERC20PermitSignatureStruct | undefined> {
    const {
      maxFeePercentage = Decimal.ONE,
      gasLimitMultiplier = Decimal.ONE,
      frontendTag = '',
      approvalType = 'permit',
    } = options;
    let { collateralToken = this.underlyingCollateralToken as T } = options;

    // Only allow depositing more collateral or repaying debt
    if (this.vaultVersion === 'v1' && debtChange.gt(Decimal.ZERO)) {
      throw new Error('Cannot borrow more debt from v1 vaults');
    }

    // check whether it's closing position (i.e. collateralChange is ZERO while debtChange is negative MAX)
    if (collateralChange.isZero() && !debtChange.equals(DEBT_CHANGE_TO_CLOSE)) {
      if (debtChange.isZero()) {
        throw Error('Collateral and debt change cannot be both zero');
      }

      // It saves gas by not using the delegate contract if the collateral token is not the underlying collateral token.
      // It does it by skipping the delegate whitelisting (if it is not whitelisted) and approving the R token.
      collateralToken = this.underlyingCollateralToken as T;
    }

    let positionManaging: BasePositionManaging;

    if (this.vaultVersion === 'v2') {
      positionManaging = new InterestRatePositionManaging(this.user);
    } else if (isUnderlyingCollateralToken(collateralToken)) {
      positionManaging = new UnderlyingCollateralTokenPositionManaging(this.user);
    } else if (isWrappableCappedCollateralToken(collateralToken)) {
      positionManaging = new WrappableCappedCollateralTokenPositionManaging(this.user);
    } else if (this.underlyingCollateralToken === 'wstETH' && collateralToken === 'stETH') {
      positionManaging = new StEthPositionManaging(this.user);
    } else {
      throw new Error(
        `Underlying collateral token ${this.underlyingCollateralToken} does not support collateral token ${collateralToken}`,
      );
    }

    yield* positionManaging.manage(
      collateralChange,
      debtChange,
      this.underlyingCollateralToken,
      this.isDelegateWhitelisted,
      {
        ...options,
        maxFeePercentage,
        gasLimitMultiplier,
        frontendTag,
        approvalType,
        collateralToken,
      },
    );
  }

  /**
   * Returns the steps for managing the leverage position's collateral and leverage multiplier. The steps are not dispatched
   * automatically and it is the caller's response to dispatch them. Each step contains the type of the step, the total
   * number of steps, and the action to perform. The action is either a transaction to dispatch or a function that
   * returns a permit signature for the collateral token.
   * @param actualPrincipalCollateralChange The amount of change the collateral by. Positive values deposit collateral, negative values
   * withdraw it.
   * @param leverage The leverage multiplier for the position.
   * @param options.maxFeePercentage The maximum fee percentage to pay for the operation. Defaults to 1 (100%).
   * @param options.collateralToken The collateral token to use for the operation. Defaults to the position's underlying
   * collateral token.
   * @param options.gasLimitMultiplier The multiplier for the gas limit of the transaction. Defaults to 1.
   * @param options.frontendTag The frontend operator tag for the transaction. Optional.
   * @param options.approvalType The approval type for the collateral token or R token. Smart contract position owners
   * have to use `approve` since they don't support signing. Defaults to permit.
   * @param swapRouter Swap router that swap will use for the operation
   * @param options.isDelegateWhitelisted Whether the delegate is whitelisted for the position owner. If not provided,
   * it will be fetched automatically.
   * @param options.collateralTokenAllowance The collateral token allowance of the position owner for the position
   * manager. If not provided, it will be fetched automatically.
   * @param options.collateralPermitSignature The collateral token permit signature. If not provided, it will be asked
   * from the user.
   */
  public async *getLeverageSteps(
    currentPrincipalCollateral: Decimal,
    principalCollateralChange: Decimal,
    leverage: Decimal,
    slippage: Decimal,
    options: LeveragePositionOptions<SupportedCollateralTokens[T]> & LeveragePositionStepsPrefetch = {},
  ): AsyncGenerator<LeveragePositionStep, void, ERC20PermitSignatureStruct | undefined> {
    if (!this.user.provider) {
      throw new Error('Provider not set, please set provider before calling this method');
    }
    const {
      maxFeePercentage = Decimal.ONE,
      gasLimitMultiplier = Decimal.ONE,
      frontendTag,
      swapRouter = '1inch',
    } = options;
    const { collateralToken = this.underlyingCollateralToken as T } = options;

    let {
      isDelegateWhitelisted,
      collateralTokenAllowance,
      currentDebt,
      currentCollateral,
      underlyingRate,
      borrowRate,
      underlyingCollateralPrice,
    } = options;

    const priceFeed = new PriceFeed(this.user.provider);
    if (!underlyingRate) {
      underlyingRate = await priceFeed.getUnderlyingCollateralRate(this.underlyingCollateralToken, collateralToken);
    }

    const actualPrincipalCollateralChange = principalCollateralChange.mul(Decimal.ONE.div(underlyingRate));

    const absolutePrincipalCollateralChangeValue = actualPrincipalCollateralChange.abs().value;
    const isPrincipalCollateralIncrease = actualPrincipalCollateralChange.gt(Decimal.ZERO);
    let debtChange = Decimal.ZERO;
    const isClosePosition = leverage.equals(1) && actualPrincipalCollateralChange.isZero();
    const collateralTokenContract = getTokenContract(collateralToken, this.user);
    const collateralTokenAllowanceRequired = collateralTokenContract !== null && isPrincipalCollateralIncrease;
    const userAddress = await this.getUserAddress();

    if (slippage.gt(SWAP_ROUTER_MAX_SLIPPAGE[swapRouter])) {
      throw new Error(
        `Slippage (${slippage.toTruncated(4)}) should not be greater than ${SWAP_ROUTER_MAX_SLIPPAGE[swapRouter]}`,
      );
    }

    if (!currentDebt) {
      // Make sure we have latest debt balance data before proceeding
      currentDebt = await this.fetchDebt();
    }
    if (!currentCollateral) {
      currentCollateral = await this.fetchCollateral();
    }
    if (!borrowRate) {
      const stats = Protocol.getInstance(this.user.provider);

      const rates = await stats.fetchBorrowingRate();
      borrowRate = rates[this.underlyingCollateralToken] || undefined;
    }

    if (!borrowRate) {
      throw new Error('Failed to fetch borrowing rate!');
    }

    // In case the delegate whitelisting check is not passed externally, check the whitelist status
    if (isDelegateWhitelisted === undefined) {
      isDelegateWhitelisted = await this.isDelegateWhitelisted(
        RaftConfig.networkConfig.oneInchOneStepLeverageStEth,
        userAddress,
      );
    }

    // In case the collateral token allowance check is not passed externally, check the allowance
    if (collateralTokenAllowance === undefined) {
      if (collateralTokenAllowanceRequired) {
        collateralTokenAllowance = await getTokenAllowance(
          collateralTokenContract,
          userAddress,
          RaftConfig.networkConfig.oneInchOneStepLeverageStEth,
        );
      } else {
        collateralTokenAllowance = Decimal.MAX_DECIMAL;
      }
    }

    const whitelistingStepNeeded = !isDelegateWhitelisted;
    const collateralApprovalStepNeeded =
      collateralTokenAllowanceRequired && // action needs collateral token allowance check
      principalCollateralChange.gt(collateralTokenAllowance ?? Decimal.ZERO); // current allowance is not enough

    // The number of steps is the number of optional steps that are required based on input values plus one required
    // step (`leverage`)
    const numberOfSteps = Number(whitelistingStepNeeded) + Number(collateralApprovalStepNeeded) + 1;
    let stepCounter = 1;

    if (whitelistingStepNeeded) {
      yield* getWhitelistStep(
        this.positionManager,
        RaftConfig.networkConfig.oneInchOneStepLeverageStEth,
        stepCounter++,
        numberOfSteps,
      );
    }

    if (collateralApprovalStepNeeded) {
      yield* getPermitOrApproveTokenStep(
        this.user,
        collateralToken,
        collateralTokenContract,
        principalCollateralChange,
        RaftConfig.networkConfig.oneInchOneStepLeverageStEth,
        stepCounter++,
        numberOfSteps,
        false, // One step leverage doesn't support permit
      );
    }

    const underlyingCollateralTokenAddress = RaftConfig.getTokenAddress(this.underlyingCollateralToken);
    const rAddress = RaftConfig.networkConfig.tokens['R'].address;

    if (collateralToken === 'wstETH' || collateralToken === 'stETH') {
      if (!underlyingCollateralPrice) {
        underlyingCollateralPrice = await priceFeed.getPrice(this.underlyingCollateralToken);
      }

      const spotSwap = new Decimal(1000);
      const rateSwapCalldata = await this.getSwapCallDataFrom1inch(
        rAddress,
        underlyingCollateralTokenAddress,
        spotSwap,
        slippage,
      );

      const amountOut = new Decimal(
        BigInt(rateSwapCalldata.data.toTokenAmount),
        rateSwapCalldata.data.toToken.decimals,
      );
      const oneInchRate = spotSwap.div(amountOut);

      // User is closing the position
      if (isClosePosition) {
        debtChange = Decimal.MAX_DECIMAL.mul(-1);
      }
      // User is opening the position
      else if (currentCollateral.isZero() && currentDebt.isZero()) {
        debtChange = underlyingCollateralPrice
          .mul(actualPrincipalCollateralChange)
          .mul(leverage.sub(1))
          .div(
            underlyingCollateralPrice
              .div(oneInchRate)
              .sub(leverage.mul(underlyingCollateralPrice.div(oneInchRate)))
              .add(leverage.mul(Decimal.ONE.add(borrowRate))),
          );
      }
      // User is adjusting the position
      else {
        const newFinalCollateral = currentPrincipalCollateral.add(actualPrincipalCollateralChange);

        const newTotalDebt = underlyingCollateralPrice
          .mul(newFinalCollateral)
          .mul(leverage.sub(1))
          .div(
            underlyingCollateralPrice
              .div(oneInchRate)
              .sub(leverage.mul(underlyingCollateralPrice.div(oneInchRate)))
              .add(leverage.mul(Decimal.ONE.add(borrowRate))),
          );

        debtChange = newTotalDebt.sub(currentDebt);
      }

      const isDebtIncrease = debtChange.gt(Decimal.ZERO);

      let amountToSwap: Decimal;
      // User is closing the position
      if (isClosePosition) {
        amountToSwap = currentDebt.div(oneInchRate);
      }
      // User is opening the position
      else if (currentCollateral.isZero() && currentDebt.isZero()) {
        amountToSwap = debtChange;
      }
      // User is adjusting the position
      else {
        if (isDebtIncrease) {
          amountToSwap = debtChange.abs();
        } else {
          amountToSwap = debtChange.abs().mul(Decimal.ONE.add(0.001)).div(oneInchRate);
        }
      }

      const swapCalldata = await this.getSwapCallDataFrom1inch(
        isDebtIncrease ? rAddress : underlyingCollateralTokenAddress,
        isDebtIncrease ? underlyingCollateralTokenAddress : rAddress,
        amountToSwap,
        slippage,
      );

      const functionSignatureToFromAmountOffset: { [key: string]: number } = {
        '0x12aa3caf': 164, // swap
        '0x0502b1c5': 36, // unoswap
        '0x84bd6d29': 100, // clipperSwap
        '0xe449022e': 4, // uniswapV3Swap
      };

      const swapFunctionSignature = swapCalldata.data.tx.data.substr(0, 10);

      const fromAmountOffset = functionSignatureToFromAmountOffset[swapFunctionSignature];

      const abi = new ethers.Interface(OneInchOneStepLeverageStETHABI);

      const oneInchDataAmmData = abi
        .getAbiCoder()
        .encode(['uint256', 'bytes'], [fromAmountOffset, swapCalldata.data.tx.data]);

      const oneInchAmountOut = new Decimal(BigInt(swapCalldata.data.toTokenAmount), swapCalldata.data.toToken.decimals);
      const minReturn = oneInchAmountOut.mul(Decimal.ONE.sub(slippage));

      let collateralToSwap: Decimal;
      if (isClosePosition) {
        collateralToSwap = currentDebt.mul(Decimal.ONE.add(0.001)).div(underlyingCollateralPrice);
      } else {
        collateralToSwap = debtChange.abs().mul(Decimal.ONE.add(0.001)).div(underlyingCollateralPrice);
      }

      yield {
        type: {
          name: 'leverage',
        },
        stepNumber: stepCounter++,
        numberOfSteps,
        // TODO: implement the actual leverage function
        action: () =>
          sendTransactionWithGasLimit(
            collateralToken === 'wstETH'
              ? this.loadOneStepLeverageStETH().manageLeveragedPosition // used for wstETH
              : this.loadOneStepLeverageStETH().manageLeveragedPositionStETH, // used to stETH
            [
              debtChange.abs().toBigInt(),
              isDebtIncrease,
              principalCollateralChange.abs().toBigInt(),
              isPrincipalCollateralIncrease,
              oneInchDataAmmData,
              isDebtIncrease ? minReturn.toBigInt() : collateralToSwap.toBigInt(),
              maxFeePercentage.toBigInt(),
            ],
            gasLimitMultiplier,
            frontendTag,
            this.user,
          ),
      };
    } else if (isWrappableCappedCollateralToken(collateralToken)) {
      // TODO - Add support for rETH (wrapped capped tokens)
      yield {
        type: {
          name: 'leverage',
        },
        stepNumber: stepCounter++,
        numberOfSteps,
        // TODO: implement the actual leverage function
        action: async () => {
          const dummyFunc = (
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _absoluteCollateralChangeValue: bigint,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _isCollateralIncrease: boolean,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _leverage: Decimal,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _maxFeePercentageValue: bigint,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _gasLimitMultiplier: Decimal,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _frontendTag?: string,
          ) => false;
          dummyFunc(
            absolutePrincipalCollateralChangeValue,
            isPrincipalCollateralIncrease,
            leverage,
            maxFeePercentage.toBigInt(),
            gasLimitMultiplier,
            frontendTag,
          );
          return {} as TransactionResponse;
        },
      };
    } else {
      throw new Error(
        `Underlying collateral token ${this.underlyingCollateralToken} does not support collateral token ${collateralToken}`,
      );
    }
  }

  /**
   * Checks if delegate for a given collateral token is whitelisted for the position owner.
   * @param collateralToken Collateral token to check the whitelist for.
   * @returns True if the delegate is whitelisted or the collateral token is the position's underlying collateral token,
   * otherwise false.
   */
  public async isDelegateWhitelisted(delegateAddress: string, userAddress: string): Promise<boolean> {
    return await this.positionManager.isDelegateWhitelisted(userAddress, delegateAddress);
  }

  /**
   * Whitelists the delegate for a given collateral token. This is needed for the position owner to be able to open the
   * position for the first time or after the delegate has been removed from the whitelist. {@link managePosition}
   * handles the whitelisting automatically.
   * @param collateralToken The collateral token for which the delegate should be whitelisted.
   * @returns Transaction response if the whitelisting is needed, otherwise null.
   */
  public async whitelistDelegate(
    collateralToken: T | SupportedCollateralTokens[T],
  ): Promise<ContractTransactionResponse | null> {
    if (!this.isUnderlyingCollateralToken(collateralToken)) {
      return await this.positionManager.whitelistDelegate(
        RaftConfig.getPositionManagerAddress(this.underlyingCollateralToken, collateralToken),
        true,
      );
    }

    return null;
  }

  /**
   * Opens the position by depositing collateral and borrowing debt from the position manager. Does not fetch the
   * position's collateral and debt amounts after the operation. Checks whether the collateral token allowance is
   * sufficient and if not, it asks the user to approve the collateral change.
   * @param collateralAmount The amount of collateral to deposit. Must be greater than 0.
   * @param debtAmount The amount of debt to borrow. Must be greater than 0.
   * @param options.maxFeePercentage The maximum fee percentage to pay for the operation. Defaults to 1 (100%).
   * @param options.collateralToken The collateral token to use for the operation. Defaults to the position's underlying
   * collateral token.
   * @param options.gasLimitMultiplier The multiplier for the gas limit of the transaction. Defaults to 1.
   * @param options.frontendTag The frontend operator tag for the transaction. Optional.
   * @param options.approvalType The approval type for the collateral token or R token. Smart contract position owners
   * have to use `approve` since they don't support signing. Defaults to permit.
   * @param options.onDelegateWhitelistingStart A callback that is called when the delegate whitelisting starts.
   * Optional.
   * @param options.onDelegateWhitelistingEnd A callback that is called when the delegate whitelisting ends. Optional.
   * @param options.onApprovalStart A callback that is called when the collateral token or R approval starts. If
   * approval is not needed, the callback will never be called. Optional.
   * @param options.onApprovalEnd A callback that is called when the approval ends. Optional.
   * @throws An error if the collateral amount is less than or equal to 0.
   * @throws An error if the debt amount is less than or equal to 0.
   */
  public async open(
    collateralAmount: Decimal,
    debtAmount: Decimal,
    options: ManagePositionOptions<SupportedCollateralTokens[T]> & ManagePositionCallbacks = {},
  ): Promise<void> {
    if (collateralAmount.lte(Decimal.ZERO)) {
      throw new Error('Collateral amount must be greater than 0');
    }
    if (debtAmount.lte(Decimal.ZERO)) {
      throw new Error('Debt amount must be greater than 0');
    }

    this.manage(collateralAmount, debtAmount, options);
  }

  /**
   * Closes the position by withdrawing collateral and repaying debt to the position manager. Fetches the position's
   * collateral and debt amounts before the operation, but does not fetch them after.
   * @param options.maxFeePercentage The maximum fee percentage to pay for the operation. Defaults to 1 (100%).
   * @param options.collateralToken The collateral token to use for the operation. Defaults to the position's underlying
   * collateral token.
   * @param options.gasLimitMultiplier The multiplier for the gas limit of the transaction. Defaults to 1.
   * @param options.frontendTag The frontend operator tag for the transaction. Optional.
   * @param options.approvalType The approval type for the collateral token or R token. Smart contract position owners
   * have to use `approve` since they don't support signing. Defaults to permit.
   * @param options.onDelegateWhitelistingStart A callback that is called when the delegate whitelisting starts.
   * Optional.
   * @param options.onDelegateWhitelistingEnd A callback that is called when the delegate whitelisting ends. Optional.
   * @param options.onApprovalStart A callback that is called when the collateral token or R approval starts. If
   * approval is not needed, the callback will never be called. Optional.
   * @param options.onApprovalEnd A callback that is called when the approval ends. Optional.
   */
  public async close(
    options: ManagePositionOptions<SupportedCollateralTokens[T]> & ManagePositionCallbacks = {},
  ): Promise<void> {
    this.manage(Decimal.ZERO, DEBT_CHANGE_TO_CLOSE, options);
  }

  /**
   * Adds more collateral to the position by depositing it to the position manager. Does not fetch the position's
   * collateral and debt amounts after the operation. Checks whether the collateral token allowance is sufficient and if
   * not, it asks the user to approve the collateral change.
   * @param amount The amount of collateral to deposit. Must be greater than 0.
   * @param options.maxFeePercentage The maximum fee percentage to pay for the operation. Defaults to 1 (100%).
   * @param options.collateralToken The collateral token to use for the operation. Defaults to the position's underlying
   * collateral token.
   * @param options.gasLimitMultiplier The multiplier for the gas limit of the transaction. Defaults to 1.
   * @param options.frontendTag The frontend operator tag for the transaction. Optional.
   * @param options.approvalType The approval type for the collateral token or R token. Smart contract position owners
   * have to use `approve` since they don't support signing. Defaults to permit.
   * @param options.onDelegateWhitelistingStart A callback that is called when the delegate whitelisting starts.
   * Optional.
   * @param options.onDelegateWhitelistingEnd A callback that is called when the delegate whitelisting ends. Optional.
   * @param options.onApprovalStart A callback that is called when the collateral token or R approval starts. If
   * approval is not needed, the callback will never be called. Optional.
   * @param options.onApprovalEnd A callback that is called when the approval ends. Optional.
   * @throws An error if the amount is less than or equal to 0.
   */
  public async addCollateral(
    amount: Decimal,
    options: ManagePositionOptions<SupportedCollateralTokens[T]> & ManagePositionCallbacks = {},
  ): Promise<void> {
    if (amount.lte(Decimal.ZERO)) {
      throw new Error('Amount must be greater than 0.');
    }

    this.manage(amount, Decimal.ZERO, options);
  }

  /**
   * Removes collateral from the position by withdrawing it from the position manager. Does not fetch the position's
   * collateral and debt amounts after the operation.
   * @param amount The amount of collateral to withdraw. Must be greater than 0.
   * @param options.maxFeePercentage The maximum fee percentage to pay for the operation. Defaults to 1 (100%).
   * @param options.collateralToken The collateral token to use for the withdrawal. Defaults to the position's underlying
   * collateral token.
   * @param options.gasLimitMultiplier The multiplier for the gas limit of the transaction. Defaults to 1.
   * @param options.frontendTag The frontend operator tag for the transaction. Optional.
   * @param options.approvalType The approval type for the collateral token or R token. Smart contract position owners
   * have to use `approve` since they don't support signing. Defaults to permit.
   * @param options.onDelegateWhitelistingStart A callback that is called when the delegate whitelisting starts.
   * Optional.
   * @param options.onDelegateWhitelistingEnd A callback that is called when the delegate whitelisting ends. Optional.
   * @param options.onApprovalStart A callback that is called when the collateral token or R approval starts. If
   * approval is not needed, the callback will never be called. Optional.
   * @param options.onApprovalEnd A callback that is called when the approval ends. Optional.
   * @throws An error if the amount is less than or equal to 0.
   */
  public async withdrawCollateral(
    amount: Decimal,
    options: ManagePositionOptions<SupportedCollateralTokens[T]> & ManagePositionCallbacks = {},
  ): Promise<void> {
    if (amount.lte(Decimal.ZERO)) {
      throw new Error('Amount must be greater than 0.');
    }

    this.manage(amount.mul(-1), Decimal.ZERO, options);
  }

  /**
   * Borrows more debt from the position by borrowing it from the position manager. Does not fetch the position's
   * collateral and debt amounts after the operation.
   * @param amount The amount of debt to borrow. Must be greater than 0.
   * @param options.maxFeePercentage The maximum fee percentage to pay for the operation. Defaults to 1 (100%).
   * @param options.collateralToken The collateral token to use for the operation. Defaults to the position's underlying
   * collateral token.
   * @param options.gasLimitMultiplier The multiplier for the gas limit of the transaction. Defaults to 1.
   * @param options.frontendTag The frontend operator tag for the transaction. Optional.
   * @param options.approvalType The approval type for the collateral token or R token. Smart contract position owners
   * have to use `approve` since they don't support signing. Defaults to permit.
   * @param options.onDelegateWhitelistingStart A callback that is called when the delegate whitelisting starts.
   * Optional.
   * @param options.onDelegateWhitelistingEnd A callback that is called when the delegate whitelisting ends. Optional.
   * @param options.onApprovalStart A callback that is called when the collateral token or R approval starts. If
   * approval is not needed, the callback will never be called. Optional.
   * @param options.onApprovalEnd A callback that is called when the approval ends. Optional.
   * @throws An error if the amount is less than or equal to 0.
   */
  public async borrow(
    amount: Decimal,
    options: ManagePositionOptions<SupportedCollateralTokens[T]> & ManagePositionCallbacks = {},
  ): Promise<void> {
    if (amount.lte(Decimal.ZERO)) {
      throw new Error('Amount must be greater than 0.');
    }

    this.manage(Decimal.ZERO, amount, options);
  }

  /**
   * Repays debt to the position by repaying it to the position manager. Does not fetch the position's collateral and
   * debt amounts after the operation.
   * @param amount The amount of debt to repay. Must be greater than 0.
   * @param options.maxFeePercentage The maximum fee percentage to pay for the operation. Defaults to 1 (100%).
   * @param options.collateralToken The collateral token to use for the operation. Defaults to the position's underlying
   * collateral token.
   * @param options.gasLimitMultiplier The multiplier for the gas limit of the transaction. Defaults to 1.
   * @param options.frontendTag The frontend operator tag for the transaction. Optional.
   * @param options.approvalType The approval type for the collateral token or R token. Smart contract position owners
   * have to use `approve` since they don't support signing. Defaults to permit.
   * @param options.onDelegateWhitelistingStart A callback that is called when the delegate whitelisting starts.
   * Optional.
   * @param options.onDelegateWhitelistingEnd A callback that is called when the delegate whitelisting ends. Optional.
   * @param options.onApprovalStart A callback that is called when the collateral token or R approval starts. If
   * approval is not needed, the callback will never be called. Optional.
   * @param options.onApprovalEnd A callback that is called when the approval ends. Optional.
   * @throws An error if the amount is less than or equal to 0.
   */
  public async repayDebt(
    amount: Decimal,
    options: ManagePositionOptions<SupportedCollateralTokens[T]> & ManagePositionCallbacks = {},
  ): Promise<void> {
    if (amount.lte(Decimal.ZERO)) {
      throw new Error('Amount must be greater than 0.');
    }

    this.manage(Decimal.ZERO, amount.mul(-1), options);
  }

  /**
   * Returns the address of the owner of the position.
   * @returns The address of the owner.
   */
  public async getUserAddress(): Promise<string> {
    if (this.userAddress === '') {
      this.userAddress = await this.user.getAddress();
    }

    return this.userAddress;
  }

  private loadOneStepLeverageStETH(): OneInchOneStepLeverageStETH {
    return OneInchOneStepLeverageStETH__factory.connect(
      RaftConfig.networkConfig.oneInchOneStepLeverageStEth,
      this.user,
    );
  }
}
