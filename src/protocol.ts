import { request, gql } from 'graphql-request';
import { JsonRpcProvider, Signer, TransactionResponse } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { RaftConfig } from './config';
import { ERC20Indexable__factory, PositionManager, PositionManager__factory } from './typechain';
import { TransactionWithFeesOptions, UNDERLYING_COLLATERAL_TOKENS, UnderlyingCollateralToken } from './types';
import { sendTransactionWithGasLimit } from './utils';

interface OpenPositionsResponse {
  count: string;
}

const BETA = new Decimal(2);
const DEVIATION = new Decimal(0.01);
const SECONDS_IN_MINUTE = 60;
const MINUTE_DECAY_FACTOR = new Decimal(999037758833783000n, Decimal.PRECISION); // (1/2)^(1/720)

export class Protocol {
  private static instance: Protocol;

  private provider: JsonRpcProvider;
  private positionManager: PositionManager;

  private _collateralSupply: Record<UnderlyingCollateralToken, Decimal | null> = {
    WETH: null,
    wstETH: null,
  };
  private _debtSupply: Record<UnderlyingCollateralToken, Decimal | null> = {
    WETH: null,
    wstETH: null,
  };
  private _borrowingRate: Record<UnderlyingCollateralToken, Decimal | null> = {
    WETH: null,
    wstETH: null,
  };
  private _redemptionRate: Decimal | null = null;
  private _openPositionCount: number | null = null;

  /**
   * Creates a new representation of a stats class. Stats is a singleton, so constructor is set to private.
   * Use Stats.getInstance() to get an instance of Stats.
   * @param provider: Provider to use for reading data from blockchain.
   */
  private constructor(provider: JsonRpcProvider) {
    this.provider = provider;

    this.positionManager = PositionManager__factory.connect(RaftConfig.networkConfig.positionManager, this.provider);
  }

  /**
   * Returns singleton instance of the class.
   * @param provider Provider to use for reading data from blockchain.
   * @returns The singleton instance.
   */
  public static getInstance(provider: JsonRpcProvider): Protocol {
    if (!Protocol.instance) {
      Protocol.instance = new Protocol(provider);
    }

    return Protocol.instance;
  }

  /**
   * Redeems collateral from all positions in exchange for amount in R.
   * @notice Redemption of R at peg will result in significant financial loss.
   * @param collateralToken The collateral token to redeem.
   * @param debtAmount The amount of debt in R to burn.
   * @param redeemer The account to redeem collateral for.
   * @param options.maxFeePercentage The maximum fee percentage to pay for redemption.
   * @returns The dispatched redemption transaction.
   */
  public async redeemCollateral(
    collateralToken: UnderlyingCollateralToken,
    debtAmount: Decimal,
    redeemer: Signer,
    options: TransactionWithFeesOptions = {},
  ): Promise<TransactionResponse> {
    const { maxFeePercentage = Decimal.ONE, gasLimitMultiplier = Decimal.ONE } = options;
    const positionManager = PositionManager__factory.connect(RaftConfig.networkConfig.positionManager, redeemer);

    return sendTransactionWithGasLimit(
      positionManager.redeemCollateral,
      [
        RaftConfig.getTokenAddress(collateralToken),
        debtAmount.toBigInt(Decimal.PRECISION),
        maxFeePercentage.toBigInt(Decimal.PRECISION),
      ],
      gasLimitMultiplier,
    );
  }

  /**
   * Raft protocol collateral supply denominated in wstETH token.
   */
  get collateralSupply(): Record<UnderlyingCollateralToken, Decimal | null> {
    return this._collateralSupply;
  }

  /**
   * Raft protocol debt supply denominated in R token.
   */
  get debtSupply(): Record<UnderlyingCollateralToken, Decimal | null> {
    return this._debtSupply;
  }

  /**
   * Raft protocol current borrowing rate.
   */
  get borrowingRate(): Record<UnderlyingCollateralToken, Decimal | null> {
    return this._borrowingRate;
  }

  /**
   * Raft protocol current redemption rate.
   */
  get redemptionRate(): Decimal | null {
    return this._redemptionRate;
  }

  /**
   * Raft protocol current number of open positions.
   */
  get openPositionCount(): number | null {
    return this._openPositionCount;
  }

  /**
   * Fetches current collateral supply for each underlying token.
   * @returns List of fetched collateral supplies.
   */
  async fetchCollateralSupply(): Promise<Record<UnderlyingCollateralToken, Decimal | null>> {
    await Promise.all(
      UNDERLYING_COLLATERAL_TOKENS.map(async collateralToken => {
        const collateralTokenAddress = RaftConfig.networkConfig.raftCollateralTokens[collateralToken];

        // Return zero if address is not defined in config
        if (!collateralTokenAddress) {
          this._collateralSupply[collateralToken] = Decimal.ZERO;
        }

        const contract = ERC20Indexable__factory.connect(collateralTokenAddress, this.provider);

        this._collateralSupply[collateralToken] = new Decimal(await contract.totalSupply(), Decimal.PRECISION);
      }),
    );

    return this._collateralSupply;
  }

  /**
   * Fetches current debt supply for each underlying token.
   * @returns List of fetched debt supplies.
   */
  async fetchDebtSupply(): Promise<Record<UnderlyingCollateralToken, Decimal | null>> {
    await Promise.all(
      UNDERLYING_COLLATERAL_TOKENS.map(async collateralToken => {
        const debtTokenAddress = RaftConfig.networkConfig.raftDebtTokens[collateralToken];

        // Return zero if address is not defined in config
        if (!debtTokenAddress) {
          this._debtSupply[collateralToken] = Decimal.ZERO;
        }

        const contract = ERC20Indexable__factory.connect(debtTokenAddress, this.provider);

        this._debtSupply[collateralToken] = new Decimal(await contract.totalSupply(), Decimal.PRECISION);
      }),
    );

    return this._debtSupply;
  }

  /**
   * Fetches current borrowing rate for specified collateral token.
   * @param collateralToken Collateral token to fetch borrowing rate for.
   * @returns Fetched borrowing rate.
   */
  async fetchBorrowingRate(): Promise<Record<UnderlyingCollateralToken, Decimal | null>> {
    await Promise.all(
      UNDERLYING_COLLATERAL_TOKENS.map(async collateralToken => {
        const collateralTokenAddress = RaftConfig.getTokenAddress(collateralToken);

        this._borrowingRate[collateralToken] = new Decimal(
          await this.positionManager.getBorrowingRate(collateralTokenAddress),
          Decimal.PRECISION,
        );
      }),
    );

    return this._borrowingRate;
  }

  /**
   * Calculates fee for redeem tx based on user input.
   * @param collateralToken Collateral token user wants to receive from redeem
   * @param rToRedeem Amount of R tokens user wants to redeem
   * @param collateralPrice Current price of collateral user wants to receive from redeem
   * @param totalDebtSupply Total debt supply of R token
   * @returns Fee percentage for redeem transaction.
   */
  public async fetchRedemptionRate(
    collateralToken: UnderlyingCollateralToken,
    rToRedeem: Decimal,
    collateralPrice: Decimal,
    totalDebtSupply: Decimal,
  ): Promise<Decimal> {
    if (collateralPrice.isZero()) {
      throw new Error('Collateral price is zero!');
    }

    const collateralAmount = rToRedeem.div(collateralPrice);
    const redeemedFraction = collateralAmount.mul(collateralPrice).div(totalDebtSupply);

    const collateralTokenAddress = RaftConfig.getTokenAddress(collateralToken);
    const [collateralInfo, lastBlock] = await Promise.all([
      this.positionManager.collateralInfo(collateralTokenAddress),
      this.provider.getBlock('latest'),
    ]);
    if (!lastBlock) {
      throw new Error('Failed to fetch latest block');
    }

    const lastFeeOperationTime = new Decimal(collateralInfo.lastFeeOperationTime, 0);
    const baseRate = new Decimal(collateralInfo.baseRate, Decimal.PRECISION);
    const redemptionSpreadDecimal = new Decimal(collateralInfo.redemptionSpread, Decimal.PRECISION);
    const latestBlockTimestampDecimal = new Decimal(lastBlock.timestamp);
    const minutesPassed = latestBlockTimestampDecimal.sub(lastFeeOperationTime).div(SECONDS_IN_MINUTE);

    // Using floor here because fractional number cannot be converted to BigInt
    const decayFactor = MINUTE_DECAY_FACTOR.pow(Math.floor(Number(minutesPassed.toString())));
    const decayedBaseRate = baseRate.mul(decayFactor);

    const newBaseRate = Decimal.min(decayedBaseRate.add(redeemedFraction.div(BETA)), Decimal.ONE);
    if (newBaseRate.lte(Decimal.ZERO)) {
      throw new Error('Calculated base rate cannot be zero or less!');
    }

    return Decimal.min(newBaseRate.add(redemptionSpreadDecimal).add(DEVIATION), Decimal.ONE);
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

    const response = await request<{ openPositionCounter: OpenPositionsResponse }>(RaftConfig.subgraphEndpoint, query);

    this._openPositionCount = Number(response.openPositionCounter.count);

    return this._openPositionCount;
  }
}
