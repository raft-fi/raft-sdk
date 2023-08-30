import { request, gql } from 'graphql-request';
import { Provider } from 'ethers';
import { Decimal } from '@tempusfinance/decimal';
import { RaftConfig } from './config';
import {
  ChaiPot__factory,
  ChaiToken__factory,
  ChainlinkDaiUsdAggregator__factory,
  ERC20Indexable__factory,
  WrappedCollateralToken,
} from './typechain';
import {
  CollateralToken,
  InterestRateVault,
  R_TOKEN,
  Token,
  UNDERLYING_COLLATERAL_TOKENS,
  UnderlyingCollateralToken,
  VAULTS_V2,
} from './types';
import {
  getPositionManagerContract,
  getTokenContract,
  getWrappedCappedCollateralToken,
  isWrappableCappedCollateralToken,
  isWrappedCappedUnderlyingCollateralToken,
  getInterestRateDebtTokenContract,
} from './utils';
import {
  BORROWING_RATE_PRECISION,
  CHAINLINK_DAI_USD_AGGREGATOR,
  CHAI_PRECISION,
  CHAI_RATE_PRECISION,
  CHAI_TOKEN_ADDRESS,
  INDEX_INCREASE_PRECISION,
  R_CHAI_PSM_ADDRESS,
  SECONDS_PER_YEAR,
} from './constants';

interface OpenPositionsResponse {
  count: string;
}

interface PsmTvlData {
  usdValue: Decimal;
  daiLocked: Decimal;
}
const FLASH_MINT_FEE_PERCENTAGE_BASE = 10_000;

export class Protocol {
  private static instance: Protocol;

  private provider: Provider;
  private _collateralSupply: Record<UnderlyingCollateralToken, Decimal | null> = {
    'wstETH-v1': null,
    'wcrETH-v1': null,
    wstETH: null,
    WETH: null,
    rETH: null,
    WBTC: null,
    cbETH: null,
    swETH: null,
  };
  private _debtSupply: Record<UnderlyingCollateralToken, Decimal | null> = {
    'wstETH-v1': null,
    'wcrETH-v1': null,
    wstETH: null,
    WETH: null,
    rETH: null,
    WBTC: null,
    cbETH: null,
    swETH: null,
  };
  private _borrowingRate: Record<UnderlyingCollateralToken, Decimal | null> = {
    'wstETH-v1': null,
    'wcrETH-v1': null,
    wstETH: null,
    WETH: null,
    rETH: null,
    WBTC: null,
    cbETH: null,
    swETH: null,
  };
  private _interestRate: Record<InterestRateVault, Decimal | null> = {
    wstETH: null,
    WETH: null,
    rETH: null,
    WBTC: null,
    cbETH: null,
    swETH: null,
  };
  private _openPositionCount: number | null = null;
  private _psmTvl: PsmTvlData | null = null;
  private _flashMintFee: Decimal | null = null;

  /**
   * Creates a new representation of a stats class. Stats is a singleton, so constructor is set to private.
   * Use Stats.getInstance() to get an instance of Stats.
   * @param provider: Provider to use for reading data from blockchain.
   */
  private constructor(provider: Provider) {
    this.provider = provider;
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

  get interestRate(): Record<InterestRateVault, Decimal | null> {
    return this._interestRate;
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
        const { decimals } = RaftConfig.networkConfig.tokens[collateralToken];
        const contract = ERC20Indexable__factory.connect(collateralTokenAddress, this.provider);

        this._collateralSupply[collateralToken] = new Decimal(await contract.totalSupply(), decimals);
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
    const chaiPsmBalanceParsed = new Decimal(chaiPsmBalance, CHAI_PRECISION);

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
        const { decimals } = RaftConfig.networkConfig.tokens[collateralToken];
        const contract = ERC20Indexable__factory.connect(debtTokenAddress, this.provider);

        this._debtSupply[collateralToken] = new Decimal(await contract.totalSupply(), decimals);
      }),
    );

    return this._debtSupply;
  }

  public async fetchTokenTotalSupply(token: Exclude<Token, 'ETH'>): Promise<Decimal> {
    const { decimals } = RaftConfig.networkConfig.tokens[token];
    const contract = getTokenContract(token, this.provider);
    return new Decimal(await contract.totalSupply(), decimals);
  }

  /**
   * Fetches current borrowing rate for specified collateral token.
   * @param collateralToken Collateral token to fetch borrowing rate for.
   * @returns Fetched borrowing rate.
   */
  async fetchBorrowingRate(): Promise<Record<UnderlyingCollateralToken, Decimal | null>> {
    const positionManager = getPositionManagerContract('base', RaftConfig.networkConfig.positionManager, this.provider);

    await Promise.all(
      UNDERLYING_COLLATERAL_TOKENS.map(async collateralToken => {
        const collateralTokenAddress = RaftConfig.getTokenAddress(collateralToken);
        if (!collateralTokenAddress) {
          console.warn(`Collateral token ${collateralToken} does not have address defined in config!`);
          return;
        }

        this._borrowingRate[collateralToken] = new Decimal(
          await positionManager.getBorrowingRate(collateralTokenAddress),
          BORROWING_RATE_PRECISION,
        );
      }),
    );

    return this._borrowingRate;
  }

  async fetchInterestRate(): Promise<Record<InterestRateVault, Decimal | null>> {
    await Promise.all(
      VAULTS_V2.map(async collateralToken => {
        const interestRateDebtTokenAddress = RaftConfig.networkConfig.raftDebtTokens[collateralToken];
        if (!interestRateDebtTokenAddress) {
          console.warn(
            `Collateral token ${collateralToken} does not have interest rate debt token address defined in config!`,
          );
          return;
        }

        const interestRateDebtToken = getInterestRateDebtTokenContract(interestRateDebtTokenAddress, this.provider);

        const indexIncreasePerSecond = new Decimal(
          await interestRateDebtToken.indexIncreasePerSecond(),
          INDEX_INCREASE_PRECISION,
        );

        this._interestRate[collateralToken] = indexIncreasePerSecond.mul(SECONDS_PER_YEAR);
      }),
    );

    return this._interestRate;
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
   * Fetches flash mint fee for the R token.
   * @returns Fetched flash mint fee.
   */
  public async fetchFlashMintFee(): Promise<Decimal> {
    const rToken = getTokenContract(R_TOKEN, this.provider);
    this._flashMintFee = new Decimal(await rToken.flashMintFeePercentage(), 0).div(FLASH_MINT_FEE_PERCENTAGE_BASE);
    return this._flashMintFee;
  }

  /**
   * Return the maximum amount of collateral that one can deposit into the protocol.
   * @param collateralToken The collateral token to check.
   * @returns The maximum amount of collateral that can be deposited or null if there is no limit.
   */
  public async getPositionCollateralCap(collateralToken: CollateralToken): Promise<Decimal | null> {
    const { decimals } = RaftConfig.networkConfig.tokens[collateralToken];
    const contract = this.getWrappedCappedCollateralTokenContract(collateralToken);

    if (!contract) {
      return null;
    }

    return new Decimal(await contract.maxBalance(), decimals);
  }

  /**
   * Return the maximum amount of collateral that the protocol can have for a given collateral token.
   * @param collateralToken The collateral token to check.
   * @returns The maximum amount of collateral that the protocol can have or null if there is no limit.
   */
  public async getTotalCollateralCap(collateralToken: CollateralToken): Promise<Decimal | null> {
    const { decimals } = RaftConfig.networkConfig.tokens[collateralToken];
    const contract = this.getWrappedCappedCollateralTokenContract(collateralToken);

    if (!contract) {
      return null;
    }

    return new Decimal(await contract.cap(), decimals);
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
