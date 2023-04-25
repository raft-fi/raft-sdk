import Decimal from '@tempusfinance/decimal';
import { ContractRunner, Provider, Signer } from 'ethers';
import { MIN_COLLATERAL_RATIO } from './constants';
import { RaftCollateralToken, RaftDebtToken } from './tokens';
import { CollateralTokenType } from './types';

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

  private collateralToken: RaftCollateralToken;
  private debtToken: RaftDebtToken;

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
    this.collateralToken = new RaftCollateralToken(this.collateralTokenType, runner);
    this.debtToken = new RaftDebtToken(runner);
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
    const collateral = await this.collateralToken.balanceOf(userAddress);
    this.setCollateral(new Decimal(collateral));
  }

  private async fetchDebt(): Promise<void> {
    const userAddress = await this.getUserAddress();
    const debt = await this.debtToken.balanceOf(userAddress);
    this.setDebt(new Decimal(debt));
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
}
