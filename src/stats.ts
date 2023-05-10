import { JsonRpcProvider } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { RAFT_COLLATERAL_TOKEN_WSTETH_ADDRESS, RAFT_DEBT_TOKEN_ADDRESS, POSITION_MANAGER_ADDRESS } from './constants';
import { ERC20Indexable, ERC20Indexable__factory, PositionManager, PositionManager__factory } from './typechain';

export class Stats {
  private static instance: Stats;

  private provider: JsonRpcProvider;
  private positionManager: PositionManager;
  private raftCollateralToken: ERC20Indexable;
  private raftDebtToken: ERC20Indexable;

  private _collateralSupply: Decimal | null = null;
  private _debtSupply: Decimal | null = null;
  private _borrowingRate: Decimal | null = null;

  /**
   * Creates a new representation of a stats class. Stats is a singleton, so constructor is set to private.
   * Use Stats.getInstance() to get an instance of Stats.
   * @param provider: Provider to use for reading data from blockchain.
   */
  private constructor(provider: JsonRpcProvider) {
    this.provider = provider;

    this.positionManager = PositionManager__factory.connect(POSITION_MANAGER_ADDRESS, this.provider);
    this.raftCollateralToken = ERC20Indexable__factory.connect(RAFT_COLLATERAL_TOKEN_WSTETH_ADDRESS, this.provider);
    this.raftDebtToken = ERC20Indexable__factory.connect(RAFT_DEBT_TOKEN_ADDRESS, this.provider);
  }

  /**
   * Returns singleton instance of Stats class.
   * @param provider Provider to use for reading data from blockchain.
   * @returns Stats singleton instance.
   */
  public static getInstance(provider: JsonRpcProvider): Stats {
    if (!Stats.instance) {
      Stats.instance = new Stats(provider);
    }

    return Stats.instance;
  }

  /**
   * Raft protocol collateral supply denominated in wstETH token.
   */
  get collateralSupply(): Decimal | null {
    return this._collateralSupply;
  }

  /**
   * Raft protocol debt supply denominated in R token.
   */
  get debtSupply(): Decimal | null {
    return this._debtSupply;
  }

  /**
   * Raft protocol current borrowing rate.
   */
  get borrowingRate(): Decimal | null {
    return this._borrowingRate;
  }

  /**
   * Fetches all stats.
   */
  public async fetch() {
    await Promise.all([this.fetchCollateralSupply(), this.fetchDebtSupply(), this.fetchBorrowingRate()]);
  }

  /**
   * Fetches current collateral supply (Amount of wstETH locked in Raft protocol).
   */
  private async fetchCollateralSupply() {
    this._collateralSupply = new Decimal(await this.raftCollateralToken.totalSupply(), Decimal.PRECISION);
  }

  /**
   * Fetches current debt supply (Amount of R users borrowed).
   */
  private async fetchDebtSupply() {
    this._debtSupply = new Decimal(await this.raftDebtToken.totalSupply(), Decimal.PRECISION);
  }

  /**
   * Fetches current borrowing rate.
   */
  private async fetchBorrowingRate() {
    this._borrowingRate = new Decimal(await this.positionManager.getBorrowingRate(), Decimal.PRECISION);
  }
}
