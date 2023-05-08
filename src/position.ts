import { Decimal } from 'tempus-decimal';
import { ContractRunner, Provider, Signer, ContractTransactionResponse } from 'ethers';
import {
  MIN_COLLATERAL_RATIO,
  POSITION_MANAGER_ADDRESS,
  POSITION_MANAGER_STETH_ADDRESS,
  RAFT_COLLATERAL_TOKEN_ADDRESSES,
  RAFT_DEBT_TOKEN_ADDRESS,
  TOKEN_TICKER_ADDRESSES_MAP,
} from './constants';
import { CollateralToken } from './types';
import {
  ERC20Indexable,
  ERC20Indexable__factory,
  ERC20,
  ERC20__factory,
  PositionManager,
  PositionManager__factory,
  PositionManagerStETH,
  PositionManagerStETH__factory,
} from './typechain';

interface ManagePositionOptions {
  maxFeePercentage?: Decimal;
  collateralToken?: CollateralToken;
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
   * @param price The price of the collateral asset.
   * @returns The collateral ratio. If the debt is 0, returns the maximum decimal value (represents infinity).
   */
  public getCollateralRatio(price: Decimal): Decimal {
    if (this.debt.equals(Decimal.ZERO)) {
      return Decimal.MAX_DECIMAL;
    }

    return this.collateral.mul(price).div(this.debt);
  }

  /**
   * Returns true if the collateral ratio of the position is below the minimum collateral ratio.
   * @param price The price of the collateral asset.
   * @returns True if the collateral ratio is below the minimum collateral ratio.
   */
  public isCollateralRatioBelowMinimum(price: Decimal): boolean {
    return this.getCollateralRatio(price).lt(MIN_COLLATERAL_RATIO);
  }
}

class PositionWithRunner extends Position {
  protected userAddress: string;
  protected underlyingCollateralToken: ERC20;

  private indexCollateralToken: ERC20Indexable;
  private indexDebtToken: ERC20Indexable;

  /**
   * Creates a new representation of a position with attached address and given initial collateral and debt amounts.
   * @param userAddress The address of the owner of the position.
   * @param collateral The collateral amount. Defaults to 0.
   * @param debt The debt amount. Defaults to 0.
   */
  public constructor(
    userAddress: string,
    runner: ContractRunner,
    collateral: Decimal = Decimal.ZERO,
    debt: Decimal = Decimal.ZERO,
  ) {
    super(collateral, debt);

    this.userAddress = userAddress;
    this.underlyingCollateralToken = ERC20__factory.connect(TOKEN_TICKER_ADDRESSES_MAP['wstETH'], runner);
    this.indexCollateralToken = ERC20Indexable__factory.connect(RAFT_COLLATERAL_TOKEN_ADDRESSES['wstETH'], runner);
    this.indexDebtToken = ERC20Indexable__factory.connect(RAFT_DEBT_TOKEN_ADDRESS, runner);
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
 * operations on the position (e.g. reading position details for liquidation). For operations that require a signer
 * (e.g. managing collateral and debt), use the {@link UserPosition} class.
 */
export class PositionWithAddress extends PositionWithRunner {
  /**
   * Creates a new representation of a position with the attached address and given initial collateral and debt amounts.
   * @param userAddress The address of the owner of the position.
   * @param provider The blockchain provider.
   * @param collateral The collateral amount. Defaults to 0.
   * @param debt The debt amount. Defaults to 0.
   */
  public constructor(
    userAddress: string,
    provider: Provider,
    collateral: Decimal = Decimal.ZERO,
    debt: Decimal = Decimal.ZERO,
  ) {
    super(userAddress, provider, collateral, debt);
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
   */
  public constructor(user: Signer, collateral: Decimal = Decimal.ZERO, debt: Decimal = Decimal.ZERO) {
    super('', user, collateral, debt);

    this.user = user;
    this.positionManager = PositionManager__factory.connect(POSITION_MANAGER_ADDRESS, user);
  }

  /**
   * Manages the position's collateral and debt amounts by depositing or withdrawing from the position manager. Does not
   * fetch the position's collateral and debt amounts after the operation. In case of adding collateral more collateral,
   * it checks whether the collateral token allowance is sufficient and if not, it asks the user to approve the
   * collateral change.
   *
   * This method is used as a generic method for managing the position's collateral and debt amounts. For more specific
   * methods, use the {@link UserPosition.open}, {@link UserPosition.close}, {@link UserPosition.addCollateral},
   * {@link UserPosition.withdrawCollateral}, {@link UserPosition.borrowDebt}, and {@link UserPosition.repayDebt}.
   * @param collateralChange The amount to change the collateral by. Positive values deposit collateral, negative values
   * withdraw collateral.
   * @param debtChange The amount to change the debt by. Positive values borrow debt, negative values repay debt.
   * @param options.maxFeePercentage The maximum fee percentage to pay for the operation. Defaults to 1 (100%).
   * @param options.collateralToken The collateral token to use for the operation. Defaults to the position's underlying
   * collateral token.
   * @returns The dispatched transaction of the operation.
   * @throws If the collateral change is negative and the collateral token is ETH.
   */
  public async manage(
    collateralChange: Decimal,
    debtChange: Decimal,
    options: ManagePositionOptions = {},
  ): Promise<ContractTransactionResponse> {
    const { maxFeePercentage = Decimal.ONE, collateralToken = 'wstETH' } = options;

    const absoluteCollateralChangeValue = collateralChange.abs().value;
    const isCollateralIncrease = collateralChange.gt(Decimal.ZERO);
    const absoluteDebtChangeValue = debtChange.abs().value;
    const isDebtIncrease = debtChange.gt(Decimal.ZERO);
    const maxFeePercentageValue = maxFeePercentage.value;

    const userAddress = await this.getUserAddress();
    const isUnderlyingToken = collateralToken === 'wstETH';
    const positionManagerAddress = isUnderlyingToken ? POSITION_MANAGER_ADDRESS : POSITION_MANAGER_STETH_ADDRESS;
    const collateralTokenContract = this.loadCollateralToken(collateralToken);

    if (!isUnderlyingToken) {
      this.checkDelegateWhitelisting(userAddress, positionManagerAddress);
    }

    if (collateralTokenContract !== null && collateralChange.gt(Decimal.ZERO)) {
      this.checkTokenAllowance(
        collateralTokenContract,
        userAddress,
        positionManagerAddress,
        collateralChange,
        absoluteCollateralChangeValue,
      );
    }

    switch (collateralToken) {
      case 'ETH':
        if (!isCollateralIncrease) {
          throw new Error('ETH withdrawal from the position is not supported');
        }

        return this.loadPositionManagerStETH().managePositionETH(
          absoluteDebtChangeValue,
          isDebtIncrease,
          maxFeePercentageValue,
          {
            value: absoluteCollateralChangeValue,
          },
        );

      case 'stETH':
        return this.loadPositionManagerStETH().managePositionStETH(
          absoluteCollateralChangeValue,
          isCollateralIncrease,
          absoluteDebtChangeValue,
          isDebtIncrease,
          maxFeePercentageValue,
        );

      case 'wstETH':
        return this.positionManager['managePosition(address,uint256,bool,uint256,bool,uint256)'](
          TOKEN_TICKER_ADDRESSES_MAP[collateralToken],
          absoluteCollateralChangeValue,
          isCollateralIncrease,
          absoluteDebtChangeValue,
          isDebtIncrease,
          maxFeePercentageValue,
        );
    }
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
   * @returns The dispatched transaction of the operation.
   */
  public async close(options: ManagePositionOptions = {}): Promise<ContractTransactionResponse> {
    await this.fetch();
    const collateralChange = this.getCollateral().mul(-1);
    const debtChange = this.getDebt().mul(-1);
    return this.manage(collateralChange, debtChange, options);
  }

  /**
   * Adds more collateral to the position by depositing it to the position manager. Does not fetch the position's
   * collateral and debt amounts after the operation. Checks whether the collateral token allowance is sufficient and if
   * not, it asks the user to approve the collateral change.
   * @param amount The amount of collateral to deposit. Must be greater than 0.
   * @param options.maxFeePercentage The maximum fee percentage to pay for the operation. Defaults to 1 (100%).
   * @param options.collateralToken The collateral token to use for the operation. Defaults to the position's underlying
   * collateral token.
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
   * @returns The dispatched transaction of the operation.
   * @throws An error if the amount is less than or equal to 0.
   */
  public async borrowDebt(amount: Decimal, options: ManagePositionOptions = {}): Promise<ContractTransactionResponse> {
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

  private async checkDelegateWhitelisting(userAddress: string, positionManagerAddress: string): Promise<void> {
    const isDelegateWhitelisted = await this.positionManager.isDelegateWhitelisted(userAddress, positionManagerAddress);

    if (!isDelegateWhitelisted) {
      const whitelistingTx = await this.positionManager.whitelistDelegate(positionManagerAddress, true);
      await whitelistingTx.wait();
    }
  }

  private async checkTokenAllowance(
    collateralTokenContract: ERC20,
    userAddress: string,
    positionManagerAddress: string,
    collateralChange: Decimal,
    absoluteCollateralChangeValue: bigint,
  ): Promise<void> {
    const allowance = new Decimal(
      await collateralTokenContract.allowance(userAddress, positionManagerAddress),
      Decimal.PRECISION,
    );

    if (allowance.lt(collateralChange)) {
      const approveTx = await collateralTokenContract.approve(positionManagerAddress, absoluteCollateralChangeValue);
      await approveTx.wait();
    }
  }

  private loadPositionManagerStETH(): PositionManagerStETH {
    if (this.positionManagerStETH) {
      return this.positionManagerStETH;
    }

    const positionManagerStETH = PositionManagerStETH__factory.connect(POSITION_MANAGER_STETH_ADDRESS, this.user);
    this.positionManagerStETH = positionManagerStETH;
    return positionManagerStETH;
  }

  private loadCollateralToken(collateralToken: CollateralToken): ERC20 | null {
    if (collateralToken === 'ETH') {
      return null;
    }

    if (this.collateralTokens.has(collateralToken)) {
      return this.collateralTokens.get(collateralToken) ?? null;
    }

    const contract = ERC20__factory.connect(TOKEN_TICKER_ADDRESSES_MAP[collateralToken], this.user);
    this.collateralTokens.set(collateralToken, contract);
    return contract;
  }
}
