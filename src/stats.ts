import { request, gql } from 'graphql-request';
import { JsonRpcProvider } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { RaftConfig } from './config';
import { ERC20Indexable, ERC20Indexable__factory, PositionManager, PositionManager__factory } from './typechain';
import { UnderlyingCollateralToken } from './types';

interface OpenPositionsResponse {
  count: string;
}

export class Stats {
  private static instance: Stats;

  private provider: JsonRpcProvider;
  private positionManager: PositionManager;
  private raftCollateralToken: ERC20Indexable;
  private raftDebtToken: ERC20Indexable;

  private _collateralSupply: Decimal | null = null;
  private _debtSupply: Decimal | null = null;
  private _borrowingRate: Decimal | null = null;
  private _openPositionCount: number | null = null;

  /**
   * Creates a new representation of a stats class. Stats is a singleton, so constructor is set to private.
   * Use Stats.getInstance() to get an instance of Stats.
   * @param provider: Provider to use for reading data from blockchain.
   */
  private constructor(provider: JsonRpcProvider) {
    this.provider = provider;

    this.positionManager = PositionManager__factory.connect(RaftConfig.networkConfig.positionManager, this.provider);
    this.raftCollateralToken = ERC20Indexable__factory.connect(
      RaftConfig.networkConfig.raftCollateralTokens['wstETH'],
      this.provider,
    );
    this.raftDebtToken = ERC20Indexable__factory.connect(RaftConfig.networkConfig.raftDebtToken, this.provider);
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
   * Raft protocol current number of open positions.
   */
  get openPositionCount(): number | null {
    return this._openPositionCount;
  }

  /**
   * Fetches current collateral supply (Amount of wstETH locked in Raft protocol).
   * @returns Fetched collateral supply
   */
  async fetchCollateralSupply(): Promise<Decimal> {
    this._collateralSupply = new Decimal(await this.raftCollateralToken.totalSupply(), Decimal.PRECISION);

    return this._collateralSupply;
  }

  /**
   * Fetches current debt supply (Amount of R users borrowed).
   * @returns Fetched debt supply
   */
  async fetchDebtSupply(): Promise<Decimal> {
    this._debtSupply = new Decimal(await this.raftDebtToken.totalSupply(), Decimal.PRECISION);

    return this._debtSupply;
  }

  /**
   * Fetches current borrowing rate for specified collateral token.
   * @param collateralToken Collateral token to fetch borrowing rate for.
   * @returns Fetched borrowing rate.
   */
  async fetchBorrowingRate(collateralToken: UnderlyingCollateralToken): Promise<Decimal> {
    const collateralTokenAddress = RaftConfig.getTokenAddress(collateralToken);
    if (collateralTokenAddress) {
      this._borrowingRate = new Decimal(
        await this.positionManager.getBorrowingRate(collateralTokenAddress),
        Decimal.PRECISION,
      );

      return this._borrowingRate;
    } else {
      throw new Error(`Collateral token ${collateralToken} is not supported`);
    }
  }

  /**
   * Fetches current open position count from TheGraph.
   * @returns Fetched open position count.
   */
  async fetchOpenPositionCount(): Promise<number> {
    const query = gql`
      {
        openPositionCounter(id: "raft-open-positions-counter") {
          count
        }
      }
    `;

    const response = await request<{ openPositionCounter: OpenPositionsResponse }>(
      RaftConfig.networkConfig.subgraphEndpointUrl,
      query,
    );

    this._openPositionCount = Number(response.openPositionCounter.count);

    return this._openPositionCount;
  }
}
