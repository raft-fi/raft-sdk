import { request, gql } from 'graphql-request';
import { Provider, Signer, TransactionResponse } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { RaftConfig } from './config';
import {
  ChaiPot__factory,
  ChaiToken__factory,
  ChainlinkDaiUsdAggregator__factory,
  ERC20Indexable__factory,
  ERC20Permit,
  PositionManager,
  WrappedCollateralToken,
} from './typechain';
import {
  CollateralToken,
  R_TOKEN,
  Token,
  TransactionWithFeesOptions,
  UNDERLYING_COLLATERAL_TOKENS,
  UnderlyingCollateralToken,
} from './types';
import {
  createPermitSignature,
  getPositionManagerContract,
  getTokenContract,
  getWrappedCappedCollateralToken,
  isWrappableCappedCollateralToken,
  isWrappedCappedUnderlyingCollateralToken,
  sendTransactionWithGasLimit,
} from './utils';
import {
  CHAINLINK_DAI_USD_AGGREGATOR,
  CHAI_RATE_PRECISION,
  CHAI_TOKEN_ADDRESS,
  FLASH_MINT_FEE,
  R_CHAI_PSM_ADDRESS,
  SECONDS_IN_MINUTE,
} from './constants';

interface OpenPositionsResponse {
  count: string;
}

interface PsmTvlData {
  usdValue: Decimal;
  daiLocked: Decimal;
}

const BETA = new Decimal(2);
const ORACLE_DEVIATION: Record<UnderlyingCollateralToken, Decimal> = {
  wstETH: new Decimal(0.01), // 1%
  wcrETH: new Decimal(0.015), // 1.5%
  WETH: new Decimal(0.005), // TODO: add oracle deviation for WETH
};

const MINUTE_DECAY_FACTOR = new Decimal(999037758833783000n, Decimal.PRECISION); // (1/2)^(1/720)

export class Protocol {
  private static instance: Protocol;

  private provider: Provider;
  private positionManager: PositionManager;
  private rToken: ERC20Permit;

  private _collateralSupply: Record<UnderlyingCollateralToken, Decimal | null> = {
    wstETH: null,
    wcrETH: null,
    WETH: null,
  };
  private _debtSupply: Record<UnderlyingCollateralToken, Decimal | null> = {
    wstETH: null,
    wcrETH: null,
    WETH: null,
  };
  private _borrowingRate: Record<UnderlyingCollateralToken, Decimal | null> = {
    wstETH: null,
    wcrETH: null,
    WETH: null,
  };
  private _redemptionRate: Decimal | null = null;
  private _openPositionCount: number | null = null;
  private _flashMintFee: Decimal = FLASH_MINT_FEE;
  private _psmTvl: PsmTvlData | null = null;

  /**
   * Creates a new representation of a stats class. Stats is a singleton, so constructor is set to private.
   * Use Stats.getInstance() to get an instance of Stats.
   * @param provider: Provider to use for reading data from blockchain.
   */
  private constructor(provider: Provider) {
    this.provider = provider;
    this.positionManager = getPositionManagerContract('base', RaftConfig.networkConfig.positionManager, this.provider);
    this.rToken = getTokenContract(R_TOKEN, this.provider);
  }

  /**
   * Returns singleton instance of the class.
   * @param provider Provider to use for reading data from blockchain.
   * @returns The singleton instance.
   */
  public static getInstance(provider: Provider): Protocol {
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

    if (isWrappedCappedUnderlyingCollateralToken(collateralToken)) {
      // TODO: Needs `getRedeemCollateralSteps` for more granular control
      const positionManagerAddress = RaftConfig.networkConfig.wrappedCollateralTokenPositionManagers[collateralToken];
      const positionManager = getPositionManagerContract('wrapped', positionManagerAddress, redeemer);
      const rPermitSignature = await createPermitSignature(redeemer, debtAmount, positionManagerAddress, this.rToken);

      return sendTransactionWithGasLimit(
        positionManager.redeemCollateral,
        [debtAmount.toBigInt(Decimal.PRECISION), maxFeePercentage.toBigInt(Decimal.PRECISION), rPermitSignature],
        gasLimitMultiplier,
      );
    }

    const positionManager = getPositionManagerContract('base', RaftConfig.networkConfig.positionManager, redeemer);

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
   * Raft protocol current flash mint fee.
   */
  get flashMintFee(): Decimal | null {
    return this._flashMintFee;
  }

  get psmTvl(): PsmTvlData | null {
    return this._psmTvl;
  }

  /**
   * Fetches current collateral supply for each underlying token.
   * @returns Fetched collateral supplies per underlying collateral token.
   */
  async fetchCollateralSupply(): Promise<Record<UnderlyingCollateralToken, Decimal | null>> {
    await Promise.all(
      UNDERLYING_COLLATERAL_TOKENS.map(async collateralToken => {
        const collateralTokenAddress = RaftConfig.networkConfig.raftCollateralTokens[collateralToken];

        // Return zero if address is not defined in config
        if (!collateralTokenAddress) {
          this._collateralSupply[collateralToken] = Decimal.ZERO;
          return this._collateralSupply;
        }

        const contract = ERC20Indexable__factory.connect(collateralTokenAddress, this.provider);

        this._collateralSupply[collateralToken] = new Decimal(await contract.totalSupply(), Decimal.PRECISION);
      }),
    );

    return this._collateralSupply;
  }

  /**
   * Fetches and stores current PSM TVL.
   * @returns Fetched PSM TVL.
   */
  async fetchPsmTvl(): Promise<PsmTvlData | null> {
    if (RaftConfig.networkId !== 1) {
      console.warn('PSM TVL is only available on mainnet');

      this._psmTvl = {
        daiLocked: Decimal.ZERO,
        usdValue: Decimal.ZERO,
      };

      return this._psmTvl;
    }

    const chaiToken = ChaiToken__factory.connect(CHAI_TOKEN_ADDRESS, this.provider);

    const chaiPotAddress = await chaiToken.pot();
    const chaiPot = ChaiPot__factory.connect(chaiPotAddress, this.provider);

    const chaiRate = await chaiPot.chi();
    const chaiRateParsed = new Decimal(chaiRate, CHAI_RATE_PRECISION);

    const chaiPsmBalance = await chaiToken.balanceOf(R_CHAI_PSM_ADDRESS);
    const chaiPsmBalanceParsed = new Decimal(chaiPsmBalance, Decimal.PRECISION);

    const psmDaiBalance = chaiRateParsed.mul(chaiPsmBalanceParsed);

    const chainlinkAggregatorStEthUsd = ChainlinkDaiUsdAggregator__factory.connect(
      CHAINLINK_DAI_USD_AGGREGATOR,
      this.provider,
    );
    const [rate, decimals] = await Promise.all([
      chainlinkAggregatorStEthUsd.latestAnswer(),
      chainlinkAggregatorStEthUsd.decimals(),
    ]);
    const daiRate = new Decimal(rate, Number(decimals));

    this._psmTvl = {
      daiLocked: psmDaiBalance,
      usdValue: psmDaiBalance.mul(daiRate),
    };

    return this._psmTvl;
  }

  /**
   * Fetches current debt supply for each underlying token.
   * @returns Fetched debt supplies per underlying collateral token.
   */
  async fetchDebtSupply(): Promise<Record<UnderlyingCollateralToken, Decimal | null>> {
    await Promise.all(
      UNDERLYING_COLLATERAL_TOKENS.map(async collateralToken => {
        const debtTokenAddress = RaftConfig.networkConfig.raftDebtTokens[collateralToken];

        // Return zero if address is not defined in config
        if (!debtTokenAddress) {
          this._debtSupply[collateralToken] = Decimal.ZERO;
          return this._debtSupply;
        }

        const contract = ERC20Indexable__factory.connect(debtTokenAddress, this.provider);

        this._debtSupply[collateralToken] = new Decimal(await contract.totalSupply(), Decimal.PRECISION);
      }),
    );

    return this._debtSupply;
  }

  public async fetchTokenTotalSupply(token: Exclude<Token, 'ETH'>): Promise<Decimal> {
    const contract = getTokenContract(token, this.provider);
    return new Decimal(await contract.totalSupply(), Decimal.PRECISION);
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

    return Decimal.min(newBaseRate.add(redemptionSpreadDecimal).add(ORACLE_DEVIATION[collateralToken]), Decimal.ONE);
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

  /**
   * Fetches flash mint fee for token R.
   * @returns Fetched flash mint fee.
   */
  async fetchFlashMintFee(): Promise<Decimal> {
    // TODO: we should fetch this value from R token contract
    return this._flashMintFee;
  }

  /**
   * Return the maximum amount of collateral that one can deposit into the protocol.
   * @param collateralToken The collateral token to check.
   * @returns The maximum amount of collateral that can be deposited or null if there is no limit.
   */
  public async getPositionCollateralCap(collateralToken: CollateralToken): Promise<Decimal | null> {
    const contract = this.getWrappedCappedCollateralTokenContract(collateralToken);

    if (!contract) {
      return null;
    }

    return new Decimal(await contract.maxBalance(), Decimal.PRECISION);
  }

  /**
   * Return the maximum amount of collateral that the protocol can have for a given collateral token.
   * @param collateralToken The collateral token to check.
   * @returns The maximum amount of collateral that the protocol can have or null if there is no limit.
   */
  public async getTotalCollateralCap(collateralToken: CollateralToken): Promise<Decimal | null> {
    const contract = this.getWrappedCappedCollateralTokenContract(collateralToken);

    if (!contract) {
      return null;
    }

    return new Decimal(await contract.cap(), Decimal.PRECISION);
  }

  private getWrappedCappedCollateralTokenContract(collateralToken: CollateralToken): WrappedCollateralToken | null {
    const isWrappableToken = isWrappableCappedCollateralToken(collateralToken);

    if (!isWrappedCappedUnderlyingCollateralToken(collateralToken) && !isWrappableToken) {
      return null;
    }

    const underlyingToken = isWrappableToken ? getWrappedCappedCollateralToken(collateralToken) : collateralToken;
    return getTokenContract(underlyingToken, this.provider);
  }
}
