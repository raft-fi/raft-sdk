import { Decimal } from '@tempusfinance/decimal';
import { ContractRunner, Provider, Signer, ContractTransactionResponse } from 'ethers';
import { request, gql } from 'graphql-request';
import { RaftConfig } from './config';
import { GAS_LIMIT_MULTIPLIER, MIN_COLLATERAL_RATIO, MIN_NET_DEBT, SUBGRAPH_ENDPOINT_URL } from './constants';
import {
  ERC20Indexable,
  ERC20Indexable__factory,
  ERC20,
  ERC20__factory,
  PositionManager,
  PositionManager__factory,
  PositionManagerStETH,
  PositionManagerStETH__factory,
  ERC20Permit,
  ERC20Permit__factory,
} from './typechain';
import { ERC20PermitSignatureStruct } from './typechain/PositionManager';
import { CollateralToken, Token, UnderlyingCollateralToken } from './types';
import { createEmptyPermitSignature, createPermitSignature } from './utils';

export type PositionTransactionType = 'OPEN' | 'ADJUST' | 'CLOSE' | 'LIQUIDATION';

interface PositionTransactionQuery {
  id: string;
  type: PositionTransactionType;
  collateralToken: string;
  collateralChange: string;
  debtChange: string;
  timestamp: string;
}

interface PositionTransactionsQuery {
  position: {
    transactions: PositionTransactionQuery[];
  } | null;
}

export const TOKENS_WITH_PERMIT = new Set<Token>(['wstETH', 'R']);

const SUPPORTED_COLLATERAL_TOKENS_PER_UNDERLYING: Record<UnderlyingCollateralToken, Set<CollateralToken>> = {
  wstETH: new Set(['ETH', 'stETH', 'wstETH']),
};

/**
 * Represents a position transaction.
 * @property id The transaction hash.
 * @property type The type of the transaction.
 * @property collateralToken The collateral token ticker.
 * @property collateralChange The collateral change amount.
 * @property debtChange The debt change amount.
 * @property timestamp The timestamp of the transaction.
 */
export interface PositionTransaction {
  id: string;
  type: PositionTransactionType;
  collateralToken: CollateralToken;
  collateralChange: Decimal;
  debtChange: Decimal;
  timestamp: Date;
}

export interface ManagePositionOptions {
  maxFeePercentage?: Decimal;
  collateralToken?: CollateralToken;
  onDelegateWhitelistingStart?: () => void;
  onDelegateWhitelistingEnd?: (error?: unknown) => void;
  onApprovalStart?: () => void;
  onApprovalEnd?: (error?: unknown) => void;
}

/**
 * Represents a position without direct contact to any opened position. It is used for calculations (e.g. collateral
 * ratio) that do not require reading data from blockchain. It is also used as a base class for other position classes,
 * like {@link PositionWithAddress} (read-only operations) and {@link UserPosition} (full managing access to
 * positions).
 */
export class Position {
  private collateral: Decimal;
  private debt: Decimal;

  /**
   * Creates a new representation of a position.
   * @param collateral The collateral amount. Defaults to 0.
   * @param debt The debt amount. Defaults to 0.
   */
  public constructor(collateral: Decimal = Decimal.ZERO, debt: Decimal = Decimal.ZERO) {
    this.collateral = collateral;
    this.debt = debt;
  }

  /**
   * Sets the collateral amount of the position.
   * @param collateral The collateral amount.
   */
  public setCollateral(collateral: Decimal): void {
    this.collateral = collateral;
  }

  /**
   * Returns the collateral amount of the position.
   * @returns The collateral amount.
   */
  public getCollateral(): Decimal {
    return this.collateral;
  }

  /**
   * Sets the debt amount of the position.
   * @param debt The debt amount.
   */
  public setDebt(debt: Decimal): void {
    this.debt = debt;
  }

  /**
   * Returns the debt amount of the position.
   * @returns The debt amount.
   */
  public getDebt(): Decimal {
    return this.debt;
  }

  /**
   * Returns the collateral ratio of the position for a given price.
   * @param collateralPrice The price of the collateral asset.
   * @returns The collateral ratio. If the debt is 0, returns the maximum decimal value (represents infinity).
   */
  public getCollateralRatio(collateralPrice: Decimal): Decimal {
    if (this.debt.equals(Decimal.ZERO)) {
      return Decimal.MAX_DECIMAL;
    }

    return this.collateral.mul(collateralPrice).div(this.debt);
  }

  /**
   * Returns true if the collateral ratio of the position is below the minimum collateral ratio.
   * @param price The price of the collateral asset.
   * @returns True if the collateral ratio is below the minimum collateral ratio.
   */
  public isCollateralRatioBelowMinimum(price: Decimal): boolean {
    return this.getCollateralRatio(price).lt(MIN_COLLATERAL_RATIO);
  }

  /**
   * Returns the position's liquidation price limit under which the position can be liquidated.
   * @returns The liquidation price limit.
   */
  public getLiquidationPriceLimit(): Decimal {
    return MIN_COLLATERAL_RATIO.mul(this.debt).div(this.collateral);
  }

  /**
   * Returns whether the position is valid. A position is valid if it is empty or if it has a positive debt amount
   * greater than or equal to the minimum net debt and has a healthy collateral ratio.
   * @param collateralPrice The price of the collateral asset.
   * @returns True if the position is valid, false otherwise.
   */
  public isValid(collateralPrice: Decimal): boolean {
    if (this.collateral.lt(Decimal.ZERO) || this.debt.lt(Decimal.ZERO)) {
      return false;
    }

    if (this.debt.equals(Decimal.ZERO)) {
      return this.collateral.equals(Decimal.ZERO);
    }

    return this.debt.gte(MIN_NET_DEBT) && this.getCollateralRatio(collateralPrice).gte(MIN_COLLATERAL_RATIO);
  }
}

class PositionWithRunner extends Position {
  protected userAddress: string;
  protected readonly underlyingCollateralToken: UnderlyingCollateralToken;

  private readonly indexCollateralToken: ERC20Indexable;
  private readonly indexDebtToken: ERC20Indexable;

  /**
   * Creates a new representation of a position with attached address and given initial collateral and debt amounts.
   * @param userAddress The address of the owner of the position.
   * @param collateral The collateral amount. Defaults to 0.
   * @param debt The debt amount. Defaults to 0.
   * @param underlyingCollateralToken The underlying collateral token. Defaults to wstETH.
   */
  public constructor(
    userAddress: string,
    runner: ContractRunner,
    collateral: Decimal = Decimal.ZERO,
    debt: Decimal = Decimal.ZERO,
    underlyingCollateralToken: UnderlyingCollateralToken = 'wstETH',
  ) {
    super(collateral, debt);

    this.userAddress = userAddress;
    this.underlyingCollateralToken = underlyingCollateralToken;
    this.indexCollateralToken = ERC20Indexable__factory.connect(
      RaftConfig.addresses.raftCollateralTokens[underlyingCollateralToken],
      runner,
    );
    this.indexDebtToken = ERC20Indexable__factory.connect(RaftConfig.addresses.raftDebtToken, runner);
  }

  /**
   * Fetches the collateral and debt amounts of the position from the blockchain.
   */
  public async fetch(): Promise<void> {
    const collateral = this.fetchCollateral();
    const debt = this.fetchDebt();
    await Promise.all([collateral, debt]);
  }

  /**
   * Fetches the list of transactions of the position.
   * @returns The list of transactions.
   */
  public async getTransactions(): Promise<PositionTransaction[]> {
    const query = gql`
      query GetTransactions($ownerAddress: String!) {
        position(id: $ownerAddress) {
          transactions(orderBy: timestamp, orderDirection: desc) {
            id
            type
            collateralToken
            collateralChange
            debtChange
            timestamp
          }
        }
      }
    `;

    const userAddress = await this.getUserAddress();
    const response = await request<PositionTransactionsQuery>(SUBGRAPH_ENDPOINT_URL, query, {
      ownerAddress: userAddress.toLowerCase(),
    });

    if (!response.position?.transactions) {
      return [];
    }

    return response.position.transactions.map(transaction => ({
      ...transaction,
      collateralToken: RaftConfig.getTokenTicker(transaction.collateralToken) as CollateralToken,
      collateralChange: Decimal.parse(BigInt(transaction.collateralChange), 0n, Decimal.PRECISION),
      debtChange: Decimal.parse(BigInt(transaction.debtChange), 0n, Decimal.PRECISION),
      timestamp: new Date(Number(transaction.timestamp) * 1000),
    }));
  }

  /**
   * Returns the address of the owner of the position.
   * @returns The address of the owner.
   */
  public async getUserAddress(): Promise<string> {
    return this.userAddress;
  }

  private async fetchCollateral(): Promise<void> {
    const userAddress = await this.getUserAddress();
    const collateral = await this.indexCollateralToken.balanceOf(userAddress);
    this.setCollateral(new Decimal(collateral, Decimal.PRECISION));
  }

  private async fetchDebt(): Promise<void> {
    const userAddress = await this.getUserAddress();
    const debt = await this.indexDebtToken.balanceOf(userAddress);
    this.setDebt(new Decimal(debt, Decimal.PRECISION));
  }
}

/**
 * A position with an attached address that is the position's owner address. This class is used for read-only
 * operations on the position (e.g. reading position details for liquidation). Also, it is possible to liquidate this
 * position. For operations that require a signer (e.g. managing collateral and debt), use the {@link UserPosition}
 * class.
 */
export class PositionWithAddress extends PositionWithRunner {
  /**
   * Creates a new representation of a position with the attached address and given initial collateral and debt amounts.
   * @param userAddress The address of the owner of the position.
   * @param provider The blockchain provider.
   * @param collateral The collateral amount. Defaults to 0.
   * @param debt The debt amount. Defaults to 0.
   * @param underlyingCollateralToken The underlying collateral token. Defaults to wstETH.
   */
  public constructor(
    userAddress: string,
    provider: Provider,
    collateral: Decimal = Decimal.ZERO,
    debt: Decimal = Decimal.ZERO,
    underlyingCollateralToken: UnderlyingCollateralToken = 'wstETH',
  ) {
    super(userAddress, provider, collateral, debt, underlyingCollateralToken);
  }

  /**
   * Liquidates the position. The liquidator has to have enough R to repay the debt of the position.
   * @param liquidator The signer of the liquidator.
   * @returns The dispatched transaction of the liquidation.
   */
  public async liquidate(liquidator: Signer): Promise<ContractTransactionResponse> {
    const positionManager = PositionManager__factory.connect(RaftConfig.addresses.positionManager, liquidator);
    return positionManager.liquidate(this.userAddress);
  }
}

/**
 * A position with an attached signer that is the position's owner. This class is used for operations that modify the
 * position (e.g. managing collateral and debt). For read-only operations on the position, use the
 * {@link PositionWithAddress} class.
 */
export class UserPosition extends PositionWithRunner {
  private user: Signer;
  private collateralTokens = new Map<CollateralToken, ERC20>();
  private positionManager: PositionManager;
  private positionManagerStETH: PositionManagerStETH | null = null;

  /**
   * Creates a new representation of a position or a given user with given initial collateral and debt amounts.
   * @param user The signer of the position's owner.
   * @param collateral The collateral amount. Defaults to 0.
   * @param debt The debt amount. Defaults to 0.
   * @param underlyingCollateralToken The underlying collateral token. Defaults to wstETH.
   */
  public constructor(
    user: Signer,
    collateral: Decimal = Decimal.ZERO,
    debt: Decimal = Decimal.ZERO,
    underlyingCollateralToken: UnderlyingCollateralToken = 'wstETH',
  ) {
    super('', user, collateral, debt, underlyingCollateralToken);

    this.user = user;
    this.positionManager = PositionManager__factory.connect(RaftConfig.addresses.positionManager, user);
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
   * @param debtChange The amount to change the debt by. Positive values borrow debt, negative values repay debt.
   * @param options.maxFeePercentage The maximum fee percentage to pay for the operation. Defaults to 1 (100%).
   * @param options.collateralToken The collateral token to use for the operation. Defaults to the position's underlying
   * collateral token.
   * @param options.onDelegateWhitelistingStart A callback that is called when the delegate whitelisting starts.
   * Optional.
   * @param options.onDelegateWhitelistingEnd A callback that is called when the delegate whitelisting ends. Optional.
   * @param options.onApprovalStart A callback that is called when the collateral token or R approval starts. If
   * approval is not needed, the callback will never be called. Optional.
   * @param options.onApprovalEnd A callback that is called when the approval ends. Optional.
   * @returns The dispatched transaction of the operation.
   * @throws If the collateral change is negative and the collateral token is ETH.
   */
  public async manage(
    collateralChange: Decimal,
    debtChange: Decimal,
    options: ManagePositionOptions = {},
  ): Promise<ContractTransactionResponse> {
    const { maxFeePercentage = Decimal.ONE, collateralToken = this.underlyingCollateralToken } = options;

    if (!SUPPORTED_COLLATERAL_TOKENS_PER_UNDERLYING[this.underlyingCollateralToken].has(collateralToken)) {
      throw Error('Unsupported collateral token');
    }

    const absoluteCollateralChangeValue = collateralChange.abs().value;
    const isCollateralIncrease = collateralChange.gt(Decimal.ZERO);
    const absoluteDebtChangeValue = debtChange.abs().value;
    const isDebtIncrease = debtChange.gt(Decimal.ZERO);
    const maxFeePercentageValue = maxFeePercentage.value;

    const userAddress = await this.getUserAddress();
    const isUnderlyingToken = this.underlyingCollateralToken === collateralToken;
    const positionManagerAddress = isUnderlyingToken
      ? RaftConfig.addresses.positionManager
      : RaftConfig.addresses.positionManagerStEth;
    const collateralTokenContract = this.loadCollateralToken(collateralToken);
    const rTokenContract = ERC20Permit__factory.connect(RaftConfig.addresses.r, this.user);

    if (!isUnderlyingToken) {
      await this.checkDelegateWhitelisting(userAddress, positionManagerAddress, options);
    }

    /**
     * In case of R repayment we need to approve delegate to spend user's R tokens.
     * This is valid only if collateral used is not wstETH, because ETH and stETH go through a delegate contract.
     */
    let rPermitSignature = createEmptyPermitSignature();
    if (!isDebtIncrease && !isUnderlyingToken) {
      rPermitSignature = await this.checkTokenAllowance(
        rTokenContract,
        userAddress,
        positionManagerAddress,
        new Decimal(absoluteDebtChangeValue, Decimal.PRECISION),
        true,
        options,
      );
    }

    let collateralPermitSignature = createEmptyPermitSignature();
    if (collateralTokenContract !== null && collateralChange.gt(Decimal.ZERO)) {
      collateralPermitSignature = await this.checkTokenAllowance(
        collateralTokenContract,
        userAddress,
        positionManagerAddress,
        new Decimal(absoluteCollateralChangeValue, Decimal.PRECISION),
        TOKENS_WITH_PERMIT.has(collateralToken),
        options,
      );
    }

    let positionManagerStEth: PositionManagerStETH;
    let gasEstimate: bigint;
    switch (collateralToken) {
      case 'ETH':
        if (!isCollateralIncrease) {
          throw new Error('ETH withdrawal from the position is not supported');
        }

        positionManagerStEth = this.loadPositionManagerStETH();
        gasEstimate = await positionManagerStEth.managePositionETH.estimateGas(
          absoluteDebtChangeValue,
          isDebtIncrease,
          maxFeePercentageValue,
          rPermitSignature,
          {
            value: absoluteCollateralChangeValue,
          },
        );

        return positionManagerStEth.managePositionETH(
          absoluteDebtChangeValue,
          isDebtIncrease,
          maxFeePercentageValue,
          rPermitSignature,
          {
            value: absoluteCollateralChangeValue,
            gasLimit: new Decimal(gasEstimate, Decimal.PRECISION).mul(GAS_LIMIT_MULTIPLIER).toBigInt(),
          },
        );

      case 'stETH':
        positionManagerStEth = this.loadPositionManagerStETH();
        gasEstimate = await positionManagerStEth.managePositionStETH.estimateGas(
          absoluteCollateralChangeValue,
          isCollateralIncrease,
          absoluteDebtChangeValue,
          isDebtIncrease,
          maxFeePercentageValue,
          rPermitSignature,
        );

        return positionManagerStEth.managePositionStETH(
          absoluteCollateralChangeValue,
          isCollateralIncrease,
          absoluteDebtChangeValue,
          isDebtIncrease,
          maxFeePercentageValue,
          rPermitSignature,
          {
            gasLimit: new Decimal(gasEstimate, Decimal.PRECISION).mul(GAS_LIMIT_MULTIPLIER).toBigInt(),
          },
        );

      case 'wstETH':
        gasEstimate = await this.positionManager.managePosition.estimateGas(
          RaftConfig.getTokenAddress(collateralToken) as string,
          userAddress,
          absoluteCollateralChangeValue,
          isCollateralIncrease,
          absoluteDebtChangeValue,
          isDebtIncrease,
          maxFeePercentageValue,
          collateralPermitSignature,
        );

        return this.positionManager.managePosition(
          RaftConfig.getTokenAddress(collateralToken) as string,
          userAddress,
          absoluteCollateralChangeValue,
          isCollateralIncrease,
          absoluteDebtChangeValue,
          isDebtIncrease,
          maxFeePercentageValue,
          collateralPermitSignature,
          {
            gasLimit: new Decimal(gasEstimate, Decimal.PRECISION).mul(GAS_LIMIT_MULTIPLIER).toBigInt(),
          },
        );
    }
  }

  /**
   * Checks if user wallet is whitelisted for provided collateral token
   * @param collateralToken Collateral token to check whitelist for
   * @returns True if wallet is whitelisted, otherwise false
   */
  public async isWalletWhitelistedForCollateral(collateralToken: CollateralToken): Promise<boolean> {
    const isUnderlyingToken = this.underlyingCollateralToken === collateralToken;

    const userAddress = await this.getUserAddress();

    // Whitelist is not needed if collateral token is the underlying token
    if (!isUnderlyingToken) {
      return await this.positionManager.isDelegateWhitelisted(userAddress, RaftConfig.addresses.positionManagerStEth);
    }
    return true;
  }

  /**
   * Whitelists wallet for collateral token
   * @param collateralToken Collateral token for which to whitelist wallet
   * @returns ContractTransactionResponse if whitelist is needed, otherwise returns true (if whitelist is not needed for provided collateral token)
   */
  public async whitelistWalletForCollateral(
    collateralToken: CollateralToken,
  ): Promise<ContractTransactionResponse | boolean> {
    const isUnderlyingToken = this.underlyingCollateralToken === collateralToken;

    if (!isUnderlyingToken) {
      return await this.positionManager.whitelistDelegate(RaftConfig.addresses.positionManagerStEth, true);
    } else {
      return true;
    }
  }

  /**
   * Approved required tokens for manage action
   * @param collateralChange Collateral change that will be sent to manage() function
   * @param debtChange Debt change that will be sent to manage() function
   * @param collateralToken Collateral token that will be sent to manage() function
   * @returns Returns permit signatures required when calling manage() function
   */
  public async approveManageTransaction(
    collateralChange: Decimal,
    debtChange: Decimal,
    collateralToken: CollateralToken,
  ) {
    const isUnderlyingToken = this.underlyingCollateralToken === collateralToken;
    const absoluteCollateralChangeValue = collateralChange.abs().value;
    const absoluteDebtChangeValue = debtChange.abs().value;
    const isDebtDecrease = debtChange.lt(Decimal.ZERO);
    const positionManagerAddress = isUnderlyingToken
      ? RaftConfig.addresses.positionManager
      : RaftConfig.addresses.positionManagerStEth;
    const rTokenContract = ERC20Permit__factory.connect(RaftConfig.addresses.r, this.user);
    const collateralTokenContract = this.loadCollateralToken(collateralToken);

    /**
     * In case of R repayment we need to approve delegate to spend user's R tokens.
     * This is valid only if collateral used is not wstETH, because ETH and stETH go through a delegate contract.
     */
    let rPermitSignature = createEmptyPermitSignature();
    if (isDebtDecrease && !isUnderlyingToken) {
      rPermitSignature = await createPermitSignature(
        this.user,
        new Decimal(absoluteDebtChangeValue, Decimal.PRECISION),
        positionManagerAddress,
        rTokenContract,
      );
    }

    let collateralPermitSignature = createEmptyPermitSignature();
    if (collateralTokenContract !== null && collateralChange.gt(Decimal.ZERO)) {
      // Use permit when possible
      if (TOKENS_WITH_PERMIT.has(collateralToken)) {
        collateralPermitSignature = await createPermitSignature(
          this.user,
          new Decimal(absoluteCollateralChangeValue, Decimal.PRECISION),
          positionManagerAddress,
          collateralTokenContract,
        );
      }

      return collateralTokenContract.approve(positionManagerAddress, absoluteCollateralChangeValue);
    }

    return {
      collateralPermit: collateralPermitSignature,
      rPermit: rPermitSignature,
    };
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
   * @param options.onDelegateWhitelistingStart A callback that is called when the delegate whitelisting starts.
   * Optional.
   * @param options.onDelegateWhitelistingEnd A callback that is called when the delegate whitelisting ends. Optional.
   * @param options.onApprovalStart A callback that is called when the collateral token or R approval starts. If
   * approval is not needed, the callback will never be called. Optional.
   * @param options.onApprovalEnd A callback that is called when the approval ends. Optional.
   * @returns The dispatched transaction of the operation.
   * @throws An error if the collateral amount is less than or equal to 0.
   * @throws An error if the debt amount is less than or equal to 0.
   */
  public async open(
    collateralAmount: Decimal,
    debtAmount: Decimal,
    options: ManagePositionOptions = {},
  ): Promise<ContractTransactionResponse> {
    if (collateralAmount.lte(Decimal.ZERO)) {
      throw new Error('Collateral amount must be greater than 0.');
    }
    if (debtAmount.lte(Decimal.ZERO)) {
      throw new Error('Debt amount must be greater than 0.');
    }

    return this.manage(collateralAmount, debtAmount, options);
  }

  /**
   * Closes the position by withdrawing collateral and repaying debt to the position manager. Fetches the position's
   * collateral and debt amounts before the operation, but does not fetch them after.
   * @param options.maxFeePercentage The maximum fee percentage to pay for the operation. Defaults to 1 (100%).
   * @param options.collateralToken The collateral token to use for the operation. Defaults to the position's underlying
   * collateral token.
   * @param options.onDelegateWhitelistingStart A callback that is called when the delegate whitelisting starts.
   * Optional.
   * @param options.onDelegateWhitelistingEnd A callback that is called when the delegate whitelisting ends. Optional.
   * @param options.onApprovalStart A callback that is called when the collateral token or R approval starts. If
   * approval is not needed, the callback will never be called. Optional.
   * @param options.onApprovalEnd A callback that is called when the approval ends. Optional.
   * @returns The dispatched transaction of the operation.
   */
  public async close(options: ManagePositionOptions = {}): Promise<ContractTransactionResponse> {
    return this.manage(Decimal.ZERO, Decimal.MAX_DECIMAL.mul(-1), options);
  }

  /**
   * Adds more collateral to the position by depositing it to the position manager. Does not fetch the position's
   * collateral and debt amounts after the operation. Checks whether the collateral token allowance is sufficient and if
   * not, it asks the user to approve the collateral change.
   * @param amount The amount of collateral to deposit. Must be greater than 0.
   * @param options.maxFeePercentage The maximum fee percentage to pay for the operation. Defaults to 1 (100%).
   * @param options.collateralToken The collateral token to use for the operation. Defaults to the position's underlying
   * collateral token.
   * @param options.onDelegateWhitelistingStart A callback that is called when the delegate whitelisting starts.
   * Optional.
   * @param options.onDelegateWhitelistingEnd A callback that is called when the delegate whitelisting ends. Optional.
   * @param options.onApprovalStart A callback that is called when the collateral token or R approval starts. If
   * approval is not needed, the callback will never be called. Optional.
   * @param options.onApprovalEnd A callback that is called when the approval ends. Optional.
   * @returns The dispatched transaction of the operation.
   * @throws An error if the amount is less than or equal to 0.
   */
  public async addCollateral(
    amount: Decimal,
    options: ManagePositionOptions = {},
  ): Promise<ContractTransactionResponse> {
    if (amount.lte(Decimal.ZERO)) {
      throw new Error('Amount must be greater than 0.');
    }

    return this.manage(amount, Decimal.ZERO, options);
  }

  /**
   * Removes collateral from the position by withdrawing it from the position manager. Does not fetch the position's
   * collateral and debt amounts after the operation.
   * @param amount The amount of collateral to withdraw. Must be greater than 0.
   * @param options.maxFeePercentage The maximum fee percentage to pay for the operation. Defaults to 1 (100%).
   * @param options.collateralToken The collateral token to use for the withdrawal. Defaults to the position's underlying
   * collateral token.
   * @param options.onDelegateWhitelistingStart A callback that is called when the delegate whitelisting starts.
   * Optional.
   * @param options.onDelegateWhitelistingEnd A callback that is called when the delegate whitelisting ends. Optional.
   * @param options.onApprovalStart A callback that is called when the collateral token or R approval starts. If
   * approval is not needed, the callback will never be called. Optional.
   * @param options.onApprovalEnd A callback that is called when the approval ends. Optional.
   * @returns The dispatched transaction of the operation.
   * @throws An error if the amount is less than or equal to 0.
   */
  public async withdrawCollateral(
    amount: Decimal,
    options: ManagePositionOptions = {},
  ): Promise<ContractTransactionResponse> {
    if (amount.lte(Decimal.ZERO)) {
      throw new Error('Amount must be greater than 0.');
    }

    return this.manage(amount.mul(-1), Decimal.ZERO, options);
  }

  /**
   * Borrows more debt from the position by borrowing it from the position manager. Does not fetch the position's
   * collateral and debt amounts after the operation.
   * @param amount The amount of debt to borrow. Must be greater than 0.
   * @param options.maxFeePercentage The maximum fee percentage to pay for the operation. Defaults to 1 (100%).
   * @param options.collateralToken The collateral token to use for the operation. Defaults to the position's underlying
   * collateral token.
   * @param options.onDelegateWhitelistingStart A callback that is called when the delegate whitelisting starts.
   * Optional.
   * @param options.onDelegateWhitelistingEnd A callback that is called when the delegate whitelisting ends. Optional.
   * @param options.onApprovalStart A callback that is called when the collateral token or R approval starts. If
   * approval is not needed, the callback will never be called. Optional.
   * @param options.onApprovalEnd A callback that is called when the approval ends. Optional.
   * @returns The dispatched transaction of the operation.
   * @throws An error if the amount is less than or equal to 0.
   */
  public async borrow(amount: Decimal, options: ManagePositionOptions = {}): Promise<ContractTransactionResponse> {
    if (amount.lte(Decimal.ZERO)) {
      throw new Error('Amount must be greater than 0.');
    }

    return this.manage(Decimal.ZERO, amount, options);
  }

  /**
   * Repays debt to the position by repaying it to the position manager. Does not fetch the position's collateral and
   * debt amounts after the operation.
   * @param amount The amount of debt to repay. Must be greater than 0.
   * @param options.maxFeePercentage The maximum fee percentage to pay for the operation. Defaults to 1 (100%).
   * @param options.collateralToken The collateral token to use for the operation. Defaults to the position's underlying
   * collateral token.
   * @param options.onDelegateWhitelistingStart A callback that is called when the delegate whitelisting starts.
   * Optional.
   * @param options.onDelegateWhitelistingEnd A callback that is called when the delegate whitelisting ends. Optional.
   * @param options.onApprovalStart A callback that is called when the collateral token or R approval starts. If
   * approval is not needed, the callback will never be called. Optional.
   * @param options.onApprovalEnd A callback that is called when the approval ends. Optional.
   * @returns The dispatched transaction of the operation.
   * @throws An error if the amount is less than or equal to 0.
   */
  public async repayDebt(amount: Decimal, options: ManagePositionOptions = {}): Promise<ContractTransactionResponse> {
    if (amount.lte(Decimal.ZERO)) {
      throw new Error('Amount must be greater than 0.');
    }

    return this.manage(Decimal.ZERO, amount.mul(-1), options);
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

  private async checkDelegateWhitelisting(
    userAddress: string,
    positionManagerAddress: string,
    options: ManagePositionOptions,
  ): Promise<void> {
    const isDelegateWhitelisted = await this.positionManager.isDelegateWhitelisted(userAddress, positionManagerAddress);

    if (!isDelegateWhitelisted) {
      const { onDelegateWhitelistingStart, onDelegateWhitelistingEnd } = options;

      onDelegateWhitelistingStart?.();

      try {
        const whitelistingTx = await this.positionManager.whitelistDelegate(positionManagerAddress, true);
        await whitelistingTx.wait();
        onDelegateWhitelistingEnd?.();
      } catch (error) {
        onDelegateWhitelistingEnd?.(error);
        throw error;
      }
    }
  }

  private async checkTokenAllowance(
    tokenContract: ERC20 | ERC20Permit,
    userAddress: string,
    spenderAddress: string,
    amountToCheck: Decimal,
    allowPermit: boolean,
    options: ManagePositionOptions,
  ): Promise<ERC20PermitSignatureStruct> {
    const allowance = new Decimal(await tokenContract.allowance(userAddress, spenderAddress), Decimal.PRECISION);

    if (allowance.lt(amountToCheck)) {
      const { onApprovalStart, onApprovalEnd } = options;

      try {
        // Use permit when possible
        if (allowPermit) {
          return createPermitSignature(this.user, amountToCheck, spenderAddress, tokenContract);
        }

        onApprovalStart?.();
        const approveTx = await tokenContract.approve(spenderAddress, amountToCheck.toBigInt(Decimal.PRECISION));
        await approveTx.wait();
        onApprovalEnd?.();
      } catch (error) {
        onApprovalEnd?.(error);
        throw error;
      }
    }

    return createEmptyPermitSignature();
  }

  private loadPositionManagerStETH(): PositionManagerStETH {
    if (this.positionManagerStETH) {
      return this.positionManagerStETH;
    }

    const positionManagerStETH = PositionManagerStETH__factory.connect(
      RaftConfig.addresses.positionManagerStEth,
      this.user,
    );
    this.positionManagerStETH = positionManagerStETH;
    return positionManagerStETH;
  }

  private loadCollateralToken(collateralToken: CollateralToken): ERC20 | null {
    if (this.collateralTokens.has(collateralToken)) {
      return this.collateralTokens.get(collateralToken) ?? null;
    }

    const tokenAddress = RaftConfig.getTokenAddress(collateralToken);

    if (!tokenAddress) {
      return null;
    }

    const contract = ERC20__factory.connect(tokenAddress, this.user);
    this.collateralTokens.set(collateralToken, contract);
    return contract;
  }
}
