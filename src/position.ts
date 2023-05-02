import Decimal from '@tempusfinance/decimal';
import { ContractRunner, Provider, Signer, ethers, ContractTransactionResponse } from 'ethers';
import {
  COLLATERAL_TOKEN_ADDRESSES,
  MIN_COLLATERAL_RATIO,
  POSITION_MANAGER_ADDRESS,
  RAFT_COLLATERAL_TOKEN_ADDRESSES,
  RAFT_DEBT_TOKEN_ADDRESS,
} from './constants';
import { CollateralTokenType } from './types';
import {
  ERC20Indexable,
  ERC20Indexable__factory,
  ERC20Permit,
  ERC20Permit__factory,
  PositionManager,
  PositionManager__factory,
} from './typechain';

const PERMIT_DEADLINE_SHIFT = 30 * 60; // 30 minutes

/**
 * Represents a position without direct contact to any opened position. It is used for calculations (e.g. collateral
 * ratio) that do not require reading data from blockchain. It is also used as a base class for other position classes,
 * like {@link PositionWithAddress} (read-only operations) and {@link UserPosition} (full managing access to
 * positions).
 */
export class Position {
  protected readonly collateralTokenType: CollateralTokenType;

  private collateral: Decimal;
  private debt: Decimal;

  /**
   * Creates a new representation of a position.
   * @param collateralTokenType The collateral token type of the position.
   * @param collateral The collateral amount. Defaults to 0.
   * @param debt The debt amount. Defaults to 0.
   */
  public constructor(
    collateralTokenType: CollateralTokenType,
    collateral: Decimal = Decimal.ZERO,
    debt: Decimal = Decimal.ZERO,
  ) {
    this.collateralTokenType = collateralTokenType;
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
    console.log(this.getCollateralRatio(price));
    return this.getCollateralRatio(price).lt(MIN_COLLATERAL_RATIO);
  }
}

class PositionWithRunner extends Position {
  protected userAddress: string;
  protected collateralToken: ERC20Permit;

  private indexCollateralToken: ERC20Indexable;
  private indexDebtToken: ERC20Indexable;

  /**
   * Creates a new representation of a position with attached address and given initial collateral and debt amounts.
   * @param userAddress The address of the owner of the position.
   * @param collateralTokenType The collateral token type of the position.
   * @param collateral The collateral amount. Defaults to 0.
   * @param debt The debt amount. Defaults to 0.
   */
  public constructor(
    userAddress: string,
    runner: ContractRunner,
    collateralTokenType: CollateralTokenType,
    collateral: Decimal = Decimal.ZERO,
    debt: Decimal = Decimal.ZERO,
  ) {
    super(collateralTokenType, collateral, debt);

    this.userAddress = userAddress;
    this.collateralToken = ERC20Permit__factory.connect(COLLATERAL_TOKEN_ADDRESSES[collateralTokenType], runner);
    this.indexCollateralToken = ERC20Indexable__factory.connect(
      RAFT_COLLATERAL_TOKEN_ADDRESSES[collateralTokenType],
      runner,
    );
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
   * @param collateralTokenType The collateral token type of the position.
   * @param collateral The collateral amount. Defaults to 0.
   * @param debt The debt amount. Defaults to 0.
   */
  public constructor(
    userAddress: string,
    provider: Provider,
    collateralTokenType: CollateralTokenType,
    collateral: Decimal = Decimal.ZERO,
    debt: Decimal = Decimal.ZERO,
  ) {
    super(userAddress, provider, collateralTokenType, collateral, debt);
  }
}

/**
 * A position with an attached signer that is the position's owner. This class is used for operations that modify the
 * position (e.g. managing collateral and debt). For read-only operations on the position, use the
 * {@link PositionWithAddress} class.
 */
export class UserPosition extends PositionWithRunner {
  private user: Signer;
  private positionManager: PositionManager;

  /**
   * Creates a new representation of a position or a given user with given initial collateral and debt amounts.
   * @param user The signer of the position's owner.
   * @param collateralTokenType The collateral token type of the position.
   * @param collateral The collateral amount. Defaults to 0.
   * @param debt The debt amount. Defaults to 0.
   */
  public constructor(
    user: Signer,
    collateralTokenType: CollateralTokenType,
    collateral: Decimal = Decimal.ZERO,
    debt: Decimal = Decimal.ZERO,
  ) {
    super('', user, collateralTokenType, collateral, debt);

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
   * @param maxFeePercentage The maximum fee percentage to pay for the operation. Defaults to 1 (100%).
   * @returns The dispatched transaction of the operation.
   */
  public async manage(
    collateralChange: Decimal,
    debtChange: Decimal,
    maxFeePercentage: Decimal = Decimal.ONE,
  ): Promise<ContractTransactionResponse> {
    if (collateralChange.gt(Decimal.ZERO)) {
      const allowance = new Decimal(
        await this.collateralToken.allowance(await this.getUserAddress(), POSITION_MANAGER_ADDRESS),
        Decimal.PRECISION,
      );

      if (allowance.lt(collateralChange)) {
        await this.collateralToken.getFunction('approve')(POSITION_MANAGER_ADDRESS, collateralChange.abs().value);
      }
    }

    return this.positionManager['managePosition(address,uint256,bool,uint256,bool,uint256)'](
      COLLATERAL_TOKEN_ADDRESSES[this.collateralTokenType],
      collateralChange.abs().value,
      collateralChange.gt(Decimal.ZERO),
      debtChange.abs().value,
      debtChange.gt(Decimal.ZERO),
      maxFeePercentage.value,
    );
  }

  /**
   * Opens the position by depositing collateral and borrowing debt from the position manager. Does not fetch the
   * position's collateral and debt amounts after the operation. Checks whether the collateral token allowance is
   * sufficient and if not, it asks the user to approve the collateral change.
   * @param collateralAmount The amount of collateral to deposit. Must be greater than 0.
   * @param debtAmount The amount of debt to borrow. Must be greater than 0.
   * @param maxFeePercentage The maximum fee percentage to pay for the operation. Defaults to 1 (100%).
   * @returns The dispatched transaction of the operation.
   * @throws An error if the collateral amount is less than or equal to 0.
   * @throws An error if the debt amount is less than or equal to 0.
   */
  public async open(
    collateralAmount: Decimal,
    debtAmount: Decimal,
    maxFeePercentage: Decimal = Decimal.ONE,
  ): Promise<ContractTransactionResponse> {
    if (collateralAmount.lte(Decimal.ZERO)) {
      throw new Error('Collateral amount must be greater than 0.');
    }
    if (debtAmount.lte(Decimal.ZERO)) {
      throw new Error('Debt amount must be greater than 0.');
    }

    return this.manage(collateralAmount, debtAmount, maxFeePercentage);
  }

  /**
   * Closes the position by withdrawing collateral and repaying debt to the position manager. Fetches the position's
   * collateral and debt amounts before the operation, but does not fetch them after.
   * @param maxFeePercentage The maximum fee percentage to pay for the operation. Defaults to 1 (100%).
   * @returns The dispatched transaction of the operation.
   */
  public async close(maxFeePercentage: Decimal = Decimal.ONE): Promise<ContractTransactionResponse> {
    await this.fetch();
    const collateralChange = this.getCollateral().mul(-1);
    const debtChange = this.getDebt().mul(-1);
    return this.manage(collateralChange, debtChange, maxFeePercentage);
  }

  /**
   * Adds more collateral to the position by depositing it to the position manager. Does not fetch the position's
   * collateral and debt amounts after the operation. Checks whether the collateral token allowance is sufficient and if
   * not, it asks the user to approve the collateral change.
   * @param amount The amount of collateral to deposit. Must be greater than 0.
   * @param maxFeePercentage The maximum fee percentage to pay for the operation. Defaults to 1 (100%).
   * @returns The dispatched transaction of the operation.
   * @throws An error if the amount is less than or equal to 0.
   */
  public async addCollateral(
    amount: Decimal,
    maxFeePercentage: Decimal = Decimal.ONE,
  ): Promise<ContractTransactionResponse> {
    if (amount.lte(Decimal.ZERO)) {
      throw new Error('Amount must be greater than 0.');
    }

    return this.manage(amount, Decimal.ZERO, maxFeePercentage);
  }

  /**
   * Removes collateral from the position by withdrawing it from the position manager. Does not fetch the position's
   * collateral and debt amounts after the operation.
   * @param amount The amount of collateral to withdraw. Must be greater than 0.
   * @param maxFeePercentage The maximum fee percentage to pay for the operation. Defaults to 1 (100%).
   * @returns The dispatched transaction of the operation.
   * @throws An error if the amount is less than or equal to 0.
   */
  public async withdrawCollateral(
    amount: Decimal,
    maxFeePercentage: Decimal = Decimal.ONE,
  ): Promise<ContractTransactionResponse> {
    if (amount.lte(Decimal.ZERO)) {
      throw new Error('Amount must be greater than 0.');
    }

    return this.manage(amount.mul(-1), Decimal.ZERO, maxFeePercentage);
  }

  /**
   * Borrows more debt from the position by borrowing it from the position manager. Does not fetch the position's
   * collateral and debt amounts after the operation.
   * @param amount The amount of debt to borrow. Must be greater than 0.
   * @param maxFeePercentage The maximum fee percentage to pay for the operation. Defaults to 1 (100%).
   * @returns The dispatched transaction of the operation.
   * @throws An error if the amount is less than or equal to 0.
   */
  public async borrowDebt(
    amount: Decimal,
    maxFeePercentage: Decimal = Decimal.ONE,
  ): Promise<ContractTransactionResponse> {
    if (amount.lte(Decimal.ZERO)) {
      throw new Error('Amount must be greater than 0.');
    }

    return this.manage(Decimal.ZERO, amount, maxFeePercentage);
  }

  /**
   * Repays debt to the position by repaying it to the position manager. Does not fetch the position's collateral and
   * debt amounts after the operation.
   * @param amount The amount of debt to repay. Must be greater than 0.
   * @param maxFeePercentage The maximum fee percentage to pay for the operation. Defaults to 1 (100%).
   * @returns The dispatched transaction of the operation.
   * @throws An error if the amount is less than or equal to 0.
   */
  public async repayDebt(
    amount: Decimal,
    maxFeePercentage: Decimal = Decimal.ONE,
  ): Promise<ContractTransactionResponse> {
    if (amount.lte(Decimal.ZERO)) {
      throw new Error('Amount must be greater than 0.');
    }

    return this.manage(Decimal.ZERO, amount.mul(-1), maxFeePercentage);
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

  private async signCollateralTokenPermit(amount: Decimal) {
    const deadline = Math.floor(Date.now() / 1000) + PERMIT_DEADLINE_SHIFT;
    const userAddress = await this.getUserAddress();
    const nonce = await this.collateralToken.nonces(userAddress);
    const domain = {
      name: await this.collateralToken.name(),
      chainId: (await this.user.provider?.getNetwork())?.chainId ?? 1,
      version: '1',
      verifyingContract: COLLATERAL_TOKEN_ADDRESSES[this.collateralTokenType],
    };
    const values = {
      owner: userAddress,
      spender: POSITION_MANAGER_ADDRESS,
      value: amount.value,
      nonce,
      deadline,
    };
    const types = {
      Permit: [
        {
          name: 'owner',
          type: 'address',
        },
        {
          name: 'spender',
          type: 'address',
        },
        {
          name: 'value',
          type: 'uint256',
        },
        {
          name: 'nonce',
          type: 'uint256',
        },
        {
          name: 'deadline',
          type: 'uint256',
        },
      ],
    };

    const signature = await this.user.signTypedData(domain, types, values);
    const signatureComponents = ethers.Signature.from(signature);

    return await this.collateralToken.permit(
      userAddress,
      POSITION_MANAGER_ADDRESS,
      amount.value,
      deadline,
      signatureComponents.v,
      signatureComponents.r,
      signatureComponents.s,
    );
  }
}
