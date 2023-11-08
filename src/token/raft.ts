import { SubgraphPoolBase, WeightedPool } from '@balancer-labs/sor';
import { BigNumber as OldBigNumber } from 'bignumber.js';
import { BigNumber } from '@ethersproject/bignumber';
import { Decimal } from '@tempusfinance/decimal';
import { Provider, Signer, TransactionResponse } from 'ethers';
import request, { gql } from 'graphql-request';
import { RaftConfig } from '../config';
import {
  ClaimRaftAndStake,
  ClaimRaftAndStake__factory,
  ERC20Permit,
  FeeDistributor,
  FeeDistributor__factory,
  MerkleDistributorWithDeadline,
  MerkleDistributorWithDeadline__factory,
  VotingEscrow,
} from '../typechain';
import { EMPTY_PERMIT_SIGNATURE, buildTransactionWithGasLimit, getTokenContract } from '../utils';
import { RAFT_BPT_TOKEN, RAFT_TOKEN, Token, TransactionWithFeesOptions, VERAFT_TOKEN } from '../types';
import { SECONDS_IN_WEEK, SECONDS_PER_YEAR } from '../constants';

// annual give away = 10% of 2.5B evenly over 3 years
const ANNUAL_GIVE_AWAY = new Decimal(2500000000).mul(0.1).div(3);

export type StakingTransactionType =
  | 'DEPOSIT_FOR'
  | 'CREATE_LOCK'
  | 'INCREASE_LOCK_AMOUNT'
  | 'INCREASE_UNLOCK_TIME'
  | 'WITHDRAW'
  | 'CLAIM';

type PoolDataOption = {
  poolData?: SubgraphPoolBase | null;
};

type PoolDataQuery = {
  pool: SubgraphPoolBase | null;
};

type StakingTransactionsQuery = {
  position: {
    stakings: StakingTransactionQuery[];
  } | null;
};
type StakingTransactionQuery = {
  id: string;
  provider: string;
  type: StakingTransactionType;
  token: string;
  amount: string;
  unlockTime: string | null;
  timestamp: string;
};

type VeRaftBalancePoint = {
  bias: bigint;
  slope: bigint;
  ts: bigint;
  blk: bigint;
};

type BptLockedBalance = {
  amount: bigint;
  end: bigint;
};

export type UserVeRaftBalance = {
  bptLockedBalance: Decimal;
  veRaftBalance: Decimal;
  unlockTime: Date | null;
};

export type StakingTransaction = {
  id: string;
  provider: string;
  type: StakingTransactionType;
  token: Token | null;
  amount: Decimal;
  unlockTime: Date | null;
  timestamp: Date;
};

type WhitelistMerkleProof = [string, string];
type WhitelistMerkleTreeItem = {
  index: number;
  amount: string;
  proof: WhitelistMerkleProof;
};
type WhitelistMerkleTree = {
  merkleRoot: string;
  tokenTotal: string;
  claims: Record<string, WhitelistMerkleTreeItem>;
};

export interface AprEstimationOptions {
  totalAnnualShare?: Decimal;
  userAnnualShare?: Decimal;
  userVeRaftBalance?: UserVeRaftBalance;
  poolData?: SubgraphPoolBase | null;
}
export interface ClaimRaftStakeBptStepType {
  name: 'approve' | 'claim-and-stake';
  token?: typeof RAFT_TOKEN | typeof RAFT_BPT_TOKEN;
}
export interface ClaimRaftStakeBptStep {
  type: ClaimRaftStakeBptStepType;
  action: () => Promise<TransactionResponse>;
}
export type ClaimRaftStakeBptPrefetch = {
  raftAllowance?: Decimal;
  bptAllowance?: Decimal;
};
export type ClaimRaftStakeBptOptions = {
  bptApprovalMultiplier?: Decimal;
};
export type StakeBptStepType = 'approve' | 'stake-new' | 'stake-increase' | 'stake-extend' | 'stake-increase-extend';
export type StakeBptStep = {
  type: StakeBptStepType;
  action: () => Promise<TransactionResponse>;
};
export type StakeBptPrefetch = {
  userVeRaftBalance?: UserVeRaftBalance;
  bptAllowance?: Decimal;
};

export class RaftToken {
  private provider: Provider;
  private walletAddress: string | null;
  private raftContract: ERC20Permit;
  private veContract: VotingEscrow;
  private raftBptContract: ERC20Permit;
  private airdropContract: MerkleDistributorWithDeadline;
  private claimAndStakeContract: ClaimRaftAndStake;
  private feeDistributorContract: FeeDistributor;
  private merkleTree?: WhitelistMerkleTree;
  private merkleProof?: WhitelistMerkleProof | null;
  private merkleTreeIndex?: number | null;
  private claimableAmount: Decimal = Decimal.ZERO;
  private annualGiveAway: Decimal = ANNUAL_GIVE_AWAY;
  private minVeLockPeriod?: number | null;
  private maxVeLockPeriod?: number | null;
  private poolData: SubgraphPoolBase | null;

  public constructor(walletAddress: string | null, provider: Provider) {
    this.provider = provider;
    this.walletAddress = walletAddress;
    this.raftContract = getTokenContract(RAFT_TOKEN, this.provider);
    this.veContract = getTokenContract(VERAFT_TOKEN, provider);
    this.raftBptContract = getTokenContract(RAFT_BPT_TOKEN, this.provider);
    this.airdropContract = MerkleDistributorWithDeadline__factory.connect(
      RaftConfig.networkConfig.raftAirdropAddress,
      provider,
    );
    this.claimAndStakeContract = ClaimRaftAndStake__factory.connect(
      RaftConfig.networkConfig.claimRaftStakeVeRaftAddress,
      provider,
    );
    this.feeDistributorContract = FeeDistributor__factory.connect(
      RaftConfig.networkConfig.feeDistributorAddress,
      provider,
    );
    this.poolData = null;
  }

  public setWhitelist(merkleTree: WhitelistMerkleTree): void {
    if (!this.merkleTree && this.walletAddress) {
      this.merkleTree = merkleTree;

      const claim = merkleTree.claims[this.walletAddress];

      if (claim) {
        const { index, amount, proof } = claim;

        this.merkleTreeIndex = index;
        this.merkleProof = proof;
        this.claimableAmount = new Decimal(BigInt(amount), Decimal.PRECISION);
      } else {
        this.merkleTreeIndex = null;
        this.merkleProof = null;
        this.claimableAmount = Decimal.ZERO;
      }
    }
  }

  public isEligibleToClaim(): boolean {
    return Boolean(this.merkleProof);
  }

  public async hasAlreadyClaimed(): Promise<boolean> {
    if (this.merkleTreeIndex !== null && this.merkleTreeIndex !== undefined) {
      const index = BigInt(this.merkleTreeIndex);
      return this.airdropContract.isClaimed(index);
    }

    return false;
  }

  public async canClaim(): Promise<boolean> {
    const isEligibleToClaim = this.isEligibleToClaim();
    const hasAlreadyClaimed = await this.hasAlreadyClaimed();

    return isEligibleToClaim && !hasAlreadyClaimed;
  }

  public getClaimableAmount(): Decimal {
    return this.claimableAmount;
  }

  public async getClaimingDeadline(): Promise<Date> {
    const endTimeInSecond = await this.airdropContract.endTime();

    return new Date(Number(endTimeInSecond) * 1000);
  }

  private getTotalVeRaftBalanceFromPoint(point: VeRaftBalancePoint, supplyAtTimestamp: number): bigint {
    return point.bias + point.slope * (BigInt(supplyAtTimestamp) - point.ts);
  }

  /**
   * Returns the total annual veRAFT share (avg veRAFT supply)
   * @returns Total annual veRAFT share.
   */
  public async calculateTotalVeRaftAnnualShare(): Promise<Decimal> {
    const currentTimeInSecond = Math.floor(Date.now() / 1000);
    const oneYearAfterInSecond = currentTimeInSecond + SECONDS_PER_YEAR;

    const epoch = await this.veContract.epoch();
    const lastPoint = (await this.veContract.point_history(epoch)) as VeRaftBalancePoint;
    const totalSupply = this.getTotalVeRaftBalanceFromPoint(lastPoint, currentTimeInSecond);
    const totalSupplyOneYearAfter = this.getTotalVeRaftBalanceFromPoint(lastPoint, oneYearAfterInSecond);

    /*
     * veRAFT
     *    ^
     *    |\
     *    | \
     *    |  \
     *    |   \
     *    |    \
     *    |     \
     *    |      \
     *    |       \
     *    |        \
     *    |        |\
     *    |        | \
     *    |        |  \
     *    |        |   \
     *  0 +--------+------> time
     *      1 year
     */
    // x-axis: time, y-axis: veRAFT, then annual share = area of trapezoid
    const totalShare = (totalSupply + totalSupplyOneYearAfter) / 2n;

    return new Decimal(totalShare, Decimal.PRECISION);
  }

  /**
   * Returns the user annual veRAFT share (avg user veRAFT supply)
   * @param veRaftBalance User current veRAFT balance
   * @param unlockTime The unlock time for the staking.
   * @returns User annual veRAFT share.
   */
  public calculateUserVeRaftAnnualShare(veRaftBalance: Decimal, unlockTime: Date | null): Decimal {
    if (!unlockTime || veRaftBalance.isZero()) {
      return Decimal.ZERO;
    }

    const currentTimeInSecond = Math.floor(Date.now() / 1000);
    const unlockTimeInSecond = Math.floor(unlockTime.getTime() / 1000);
    const yearPortion = new Decimal(unlockTimeInSecond - currentTimeInSecond).div(SECONDS_PER_YEAR);

    if (yearPortion.gt(1)) {
      // unlock time > 1 year
      const veRaftBalanceOneYearAfter = veRaftBalance.div(yearPortion);

      /*
       * veRAFT
       *    ^
       *    |\
       *    | \
       *    |  \
       *    |   \
       *    |    \
       *    |     \
       *    |      \
       *    |       \
       *    |        \
       *    |        |\
       *    |        | \
       *    |        |  \
       *    |        |   \
       *  0 +--------+------> time
       *      1 year
       */
      // x-axis: time, y-axis: veRAFT, then annual share = area of trapezoid
      return veRaftBalance.add(veRaftBalanceOneYearAfter).div(2);
    }

    /*
     * veRAFT
     *    ^
     *    |\
     *    | \
     *    |  \
     *    |   \
     *    |    \
     *    |     \
     *  0 +--------+------> time
     *      1 year
     */
    // x-axis: time, y-axis: veRAFT, then annual share = area of triangle
    return veRaftBalance.mul(yearPortion).div(2);
  }

  /**
   * Returns the number of annual give away of RAFT.
   * @returns The annual give away of RAFT.
   */
  public getAnnualGiveAway(): Decimal {
    return this.annualGiveAway;
  }

  /**
   * Returns the min lock period for veRAFT, in second.
   * @returns The min lock period for veRAFT, in second.
   */
  public async getMinVeLockPeriod(): Promise<number> {
    if (!this.minVeLockPeriod && this.minVeLockPeriod !== 0) {
      this.minVeLockPeriod = Number(await this.veContract.MINTIME());
    }

    return this.minVeLockPeriod;
  }

  /**
   * Returns the max lock period for veRAFT, in second.
   * @returns The max lock period for veRAFT, in second.
   */
  public async getMaxVeLockPeriod(): Promise<number> {
    if (!this.maxVeLockPeriod && this.maxVeLockPeriod !== 0) {
      this.maxVeLockPeriod = Number(await this.veContract.MAXTIME());
    }

    return this.maxVeLockPeriod;
  }

  /**
   * Returns the estimated staking APR for the input.
   * @param bptAmount The stake amount of BPT.
   * @param unlockTime The unlock time for the staking.
   * @param options.totalAnnualShare Total annual veRAFT share
   * @param options.userAnnualShare User annual veRAFT share
   * @param options.userVeRaftBalance Current user veRaft position
   * @param options.poolData Balancer pool data
   * @returns The estimated staking APR.
   */
  public async estimateStakingApr(
    bptAmount: Decimal,
    unlockTime: Date,
    options: AprEstimationOptions = {},
  ): Promise<Decimal> {
    let { totalAnnualShare, userAnnualShare, userVeRaftBalance, poolData } = options;

    if (!totalAnnualShare) {
      totalAnnualShare = await this.calculateTotalVeRaftAnnualShare();
    }

    if (!userVeRaftBalance) {
      userVeRaftBalance = (await this.getUserVeRaftBalance()) ?? undefined;
    }

    if (!userAnnualShare) {
      userAnnualShare = this.calculateUserVeRaftAnnualShare(
        userVeRaftBalance?.veRaftBalance ?? Decimal.ZERO,
        userVeRaftBalance?.unlockTime ?? null,
      );
    }

    if (!poolData) {
      poolData = await this.getBalancerPoolData();
    }

    if (!poolData) {
      return Decimal.ZERO;
    }

    // use this to estimate the RAFT/BPT rate without too much price impact
    const raftBptRaft = await this.getBptAmountFromRaft(new Decimal(1), { poolData });

    if (!raftBptRaft) {
      return Decimal.ZERO;
    }

    const annualGiveAway = this.getAnnualGiveAway();
    const totalAnnualShareWithoutUser = totalAnnualShare.sub(userAnnualShare);
    const userTotalBptAmount = bptAmount.add(userVeRaftBalance?.bptLockedBalance ?? Decimal.ZERO);

    if (userTotalBptAmount.isZero()) {
      return Decimal.ZERO;
    }

    const userStakedRaftAmount = userTotalBptAmount.mul(raftBptRaft);
    const userTotalVeRaftAmount = await this.calculateVeRaftAmount(userTotalBptAmount, unlockTime);
    const newUserAnnualShare = this.calculateUserVeRaftAnnualShare(userTotalVeRaftAmount, unlockTime);
    const newTotalAnnualShare = totalAnnualShareWithoutUser.add(newUserAnnualShare);

    if (newTotalAnnualShare.isZero()) {
      return Decimal.ZERO;
    }

    // estimated APR = user annual veRAFT share / total annual veRAFT share * annual give away / staked BPT in RAFT
    return newUserAnnualShare.div(newTotalAnnualShare).mul(annualGiveAway).div(userStakedRaftAmount);
  }

  public async getBalancerPoolData(): Promise<SubgraphPoolBase | null> {
    if (!this.poolData) {
      const query = gql`
        query GetPoolData($poolId: String!) {
          pool(id: $poolId) {
            id
            address
            poolType
            swapFee
            swapEnabled
            totalWeight
            totalShares
            tokens {
              address
              balance
              decimals
              priceRate
              weight
            }
            tokensList
          }
        }
      `;

      const poolId = RaftConfig.networkConfig.balancerWeightedPoolId;
      const response = await request<PoolDataQuery>(RaftConfig.balancerSubgraphEndpoint, query, {
        poolId,
      });

      this.poolData = response.pool ?? null;
    }

    return this.poolData;
  }

  /**
   * Returns the estimated price impact for the RAFT staking.
   * @param raftAmount The stake amount of RAFT.
   * @param options.poolData The balancer pool data. If not provided, will query.
   * @returns The estimated price impact for the RAFT staking.
   */
  public async calculatePriceImpact(raftAmount: Decimal, options: PoolDataOption = {}): Promise<Decimal | null> {
    let { poolData } = options;

    if (!poolData) {
      poolData = await this.getBalancerPoolData();
    }

    if (!poolData) {
      return null;
    }

    const pool = WeightedPool.fromPool(poolData);
    const poolPairData = pool.parsePoolPairData(poolData.tokensList[0], poolData.tokensList[1]);

    let priceBefore: OldBigNumber | null = null;
    let priceAfter: OldBigNumber | null = null;

    if (poolData.tokensList[0] === RaftConfig.networkConfig.tokens.RAFT.address) {
      const tokenIn = new OldBigNumber(raftAmount.toString());

      // https://docs.balancer.fi/guides/arbitrageurs/get-spot-price.html
      // current spot price
      priceBefore = pool._spotPriceAfterSwapExactTokenInForTokenOut(poolPairData, new OldBigNumber(0));
      // spot price after
      priceAfter = pool._spotPriceAfterSwapExactTokenInForTokenOut(poolPairData, tokenIn);
    } else if (poolData.tokensList[1] === RaftConfig.networkConfig.tokens.RAFT.address) {
      const tokenOut = new OldBigNumber(raftAmount.toString());

      // https://docs.balancer.fi/guides/arbitrageurs/get-spot-price.html
      // current spot price
      priceBefore = pool._spotPriceAfterSwapTokenInForExactTokenOut(poolPairData, new OldBigNumber(0));
      // spot price after
      priceAfter = pool._spotPriceAfterSwapTokenInForExactTokenOut(poolPairData, tokenOut);
    }

    if (!priceBefore || !priceAfter) {
      return null;
    }

    const priceBeforeDecimal = new Decimal(priceBefore.toString());
    const priceAfterDecimal = new Decimal(priceAfter.toString());

    // for BAL/WETH pool, spot price returned is inverted, i.e. price of WETH/BAL
    const invertedPriceBefore = Decimal.ONE.div(priceBeforeDecimal);
    const invertedPriceAfter = Decimal.ONE.div(priceAfterDecimal);

    // price impact = 1 - priceBefore / priceAfter
    const priceImpact = Decimal.ONE.sub(invertedPriceBefore.div(invertedPriceAfter));

    return priceImpact;
  }

  public async getBptAmountFromRaft(raftAmount: Decimal, options: PoolDataOption = {}): Promise<Decimal | null> {
    let { poolData } = options;

    if (!poolData) {
      poolData = await this.getBalancerPoolData();
    }

    if (!poolData) {
      return null;
    }

    const pool = WeightedPool.fromPool(poolData);
    const amountTokenIn = BigNumber.from(raftAmount.toBigInt(Decimal.PRECISION));
    const amountsIn = poolData.tokensList.map(token =>
      token === RaftConfig.networkConfig.tokens.RAFT.address ? amountTokenIn : BigNumber.from(0),
    );

    const bptOut = pool._calcBptOutGivenExactTokensIn(amountsIn);

    if (!bptOut) {
      return null;
    }

    return new Decimal(bptOut.toBigInt(), Decimal.PRECISION);
  }

  public async calculateVeRaftAmount(bptAmount: Decimal, unlockTime: Date): Promise<Decimal> {
    const currentTimeInSecond = Math.floor(Date.now() / 1000);
    const unlockTimeInSecond = Math.floor(unlockTime.getTime() / 1000);
    const periodInSecond = unlockTimeInSecond - currentTimeInSecond;
    // period is floored by week (VotingEscrow.vy#L77)
    const trimmedPeriodInSecond = Math.floor(periodInSecond / SECONDS_IN_WEEK) * SECONDS_IN_WEEK;

    const maxVeLockPeriod = await this.getMaxVeLockPeriod();

    return new Decimal(trimmedPeriodInSecond).div(maxVeLockPeriod).mul(bptAmount);
  }

  public async getUserVeRaftBalance(): Promise<UserVeRaftBalance | null> {
    if (!this.walletAddress) {
      return null;
    }

    const [lockedBalance, veRaftBalance] = await Promise.all([
      this.veContract.locked(this.walletAddress) as Promise<BptLockedBalance>,
      this.veContract.balanceOf(this.walletAddress) as Promise<bigint>,
    ]);

    return {
      bptLockedBalance: new Decimal(lockedBalance.amount, Decimal.PRECISION),
      veRaftBalance: new Decimal(veRaftBalance, Decimal.PRECISION),
      unlockTime: lockedBalance.end ? new Date(Number(lockedBalance.end) * 1000) : null,
    };
  }

  public async getUserBptBalance(): Promise<Decimal | null> {
    if (!this.walletAddress) {
      return null;
    }

    const balance = await this.raftBptContract.balanceOf(this.walletAddress);
    return new Decimal(balance, Decimal.PRECISION);
  }

  public async getUserRaftAllowance(): Promise<Decimal | null> {
    if (!this.walletAddress) {
      return null;
    }

    const tokenAllowance = await this.raftContract.allowance(
      this.walletAddress,
      RaftConfig.networkConfig.claimRaftStakeVeRaftAddress,
    );
    return new Decimal(tokenAllowance, Decimal.PRECISION);
  }

  public async getUserBptAllowance(): Promise<Decimal | null> {
    if (!this.walletAddress) {
      return null;
    }

    const tokenAllowance = await this.raftBptContract.allowance(
      this.walletAddress,
      RaftConfig.networkConfig.tokens.veRAFT.address,
    );
    return new Decimal(tokenAllowance, Decimal.PRECISION);
  }

  public async getClaimableRaftFromStakedBpt(): Promise<Decimal | null> {
    if (!this.walletAddress) {
      return null;
    }

    const amount = await this.feeDistributorContract.claimToken.staticCall(
      this.walletAddress,
      RaftConfig.networkConfig.tokens.RAFT.address,
    );

    return new Decimal(amount, Decimal.PRECISION);
  }

  public async getStakingTransactions(): Promise<StakingTransaction[]> {
    if (!this.walletAddress) {
      return [];
    }

    const query = gql`
      query GetTransactions($ownerAddress: String!) {
        position(id: $ownerAddress) {
          stakings(orderBy: timestamp, orderDirection: desc) {
            id
            type
            provider
            token
            amount
            unlockTime
            timestamp
          }
        }
      }
    `;

    const response = await request<StakingTransactionsQuery>(RaftConfig.subgraphEndpoint, query, {
      ownerAddress: this.walletAddress.toLowerCase(),
    });

    if (!response.position?.stakings) {
      return [];
    }

    return response.position.stakings.map(
      transaction =>
        ({
          id: transaction.id,
          provider: transaction.provider,
          type: transaction.type,
          token: RaftConfig.getTokenTicker(transaction.token),
          amount: Decimal.parse(BigInt(transaction.amount), 0n, Decimal.PRECISION),
          unlockTime: transaction.timestamp ? new Date(Number(transaction.unlockTime) * 1000) : null,
          timestamp: new Date(Number(transaction.timestamp) * 1000),
        } as StakingTransaction),
    );
  }

  public async *getClaimRaftAndStakeBptSteps(
    unlockTime: Date,
    slippage: Decimal,
    signer: Signer,
    options: ClaimRaftStakeBptPrefetch & TransactionWithFeesOptions & ClaimRaftStakeBptOptions = {},
  ): AsyncGenerator<ClaimRaftStakeBptStep, void, void> {
    const { gasLimitMultiplier = Decimal.ONE, bptApprovalMultiplier = Decimal.ONE } = options;
    let { raftAllowance, bptAllowance } = options;

    if (!this.walletAddress) {
      throw new Error('Wallet is not connected to RaftToken');
    }

    if (this.merkleTreeIndex === null || this.merkleTreeIndex === undefined || !this.merkleProof) {
      throw new Error('User is not on whitelist to claim RAFT!');
    }

    if (!raftAllowance) {
      raftAllowance = (await this.getUserRaftAllowance()) ?? Decimal.ZERO;
    }

    if (!bptAllowance) {
      bptAllowance = (await this.getUserBptAllowance()) ?? Decimal.ZERO;
    }

    const unlockTimeInSec = Math.floor(unlockTime.getTime() / 1000);
    const poolData = await this.getBalancerPoolData();
    const bptBptAmountFromRaft = await this.getBptAmountFromRaft(this.claimableAmount, {
      poolData,
    });

    if (!poolData || !bptBptAmountFromRaft) {
      throw new Error('Cannot query balancer pool data!');
    }

    // minBptAmountOut = calculated BPT out * (1 - slippage)
    const minBptAmountOut = bptBptAmountFromRaft.mul(Decimal.ONE.sub(slippage));

    // approve $RAFT token for approval amount
    if (this.claimableAmount.gt(raftAllowance)) {
      const raftTokenContract = getTokenContract(RAFT_TOKEN, signer);

      const action = () =>
        raftTokenContract.approve(
          RaftConfig.networkConfig.claimRaftStakeVeRaftAddress,
          this.claimableAmount.toBigInt(Decimal.PRECISION),
        );

      yield {
        type: {
          name: 'approve',
          token: RAFT_TOKEN,
        },
        action,
      };
    }

    // approve BPT token for approval amount
    if (bptBptAmountFromRaft.gt(bptAllowance)) {
      const bptTokenContract = getTokenContract(RAFT_BPT_TOKEN, signer);
      // add multiplier for BPT approval becoz it's possible that when txn proceed it requires more than approved amount
      const approvalAmount = bptBptAmountFromRaft.mul(bptApprovalMultiplier);

      const action = () =>
        bptTokenContract.approve(
          RaftConfig.networkConfig.tokens.veRAFT.address,
          approvalAmount.toBigInt(Decimal.PRECISION),
        );

      yield {
        type: {
          name: 'approve',
          token: RAFT_BPT_TOKEN,
        },
        action,
      };
    }

    const { sendTransaction } = await buildTransactionWithGasLimit(
      this.claimAndStakeContract.execute,
      [
        BigInt(this.merkleTreeIndex),
        this.walletAddress,
        this.claimableAmount.toBigInt(Decimal.PRECISION),
        BigInt(unlockTimeInSec),
        this.merkleProof,
        minBptAmountOut.toBigInt(Decimal.PRECISION),
        EMPTY_PERMIT_SIGNATURE,
        EMPTY_PERMIT_SIGNATURE,
      ],
      signer,
      gasLimitMultiplier,
      'raft',
    );

    yield {
      type: {
        name: 'claim-and-stake',
      },
      action: sendTransaction,
    };
  }

  public async *getStakeBptSteps(
    bptAmount: Decimal,
    unlockTime: Date,
    signer: Signer,
    options: StakeBptPrefetch & TransactionWithFeesOptions = {},
  ): AsyncGenerator<StakeBptStep, void, void> {
    let { userVeRaftBalance, bptAllowance } = options;

    if (!this.walletAddress) {
      throw new Error('Wallet is not connected to RaftToken');
    }

    if (!bptAllowance) {
      bptAllowance = (await this.getUserBptAllowance()) ?? Decimal.ZERO;
    }

    // veRAFT contract doesnt accept permit
    if (bptAllowance.lt(bptAmount)) {
      // ask for BPT token approval
      const bptTokenContract = getTokenContract(RAFT_BPT_TOKEN, signer);
      const action = () =>
        bptTokenContract.approve(RaftConfig.networkConfig.tokens.veRAFT.address, bptAmount.toBigInt(Decimal.PRECISION));

      yield {
        type: 'approve',
        action,
      };
    }

    if (!userVeRaftBalance) {
      userVeRaftBalance = (await this.getUserVeRaftBalance()) ?? undefined;
    }

    const lockedBptAmount = userVeRaftBalance?.bptLockedBalance ?? Decimal.ZERO;
    const currentUnlockedTime = userVeRaftBalance?.unlockTime ?? null;

    if (lockedBptAmount.isZero()) {
      // new stake
      const action = () => this.stakeBptForVeRaft(bptAmount, unlockTime, signer);

      yield {
        type: 'stake-new',
        action,
      };
    } else {
      if (currentUnlockedTime && currentUnlockedTime > unlockTime) {
        throw new Error('Unlock time cannot be earlier than the current one');
      }

      const isIncreaseStake = bptAmount.gt(0);
      const isExtendStake = currentUnlockedTime && RaftToken.isExtendingStakeBpt(currentUnlockedTime, unlockTime);

      if (isIncreaseStake && isExtendStake) {
        // increase lock amount and extend lock period
        const action = () => this.increaseAndExtendStakeBptForVeRaft(bptAmount, unlockTime, signer);

        yield {
          type: 'stake-increase-extend',
          action,
        };
      } else if (isIncreaseStake) {
        // increase lock amount
        const action = () => this.increaseStakeBptForVeRaft(bptAmount, signer);

        yield {
          type: 'stake-increase',
          action,
        };
      } else if (isExtendStake) {
        // extend lock period
        const action = () => this.extendStakeBptForVeRaft(unlockTime, signer);

        yield {
          type: 'stake-extend',
          action,
        };
      }
    }
  }

  public async claimRaft(signer: Signer, options: TransactionWithFeesOptions = {}): Promise<TransactionResponse> {
    if (!this.walletAddress) {
      throw new Error('Wallet is not connected to RaftToken');
    }

    if (this.merkleTreeIndex === null || this.merkleTreeIndex === undefined || !this.merkleProof) {
      throw new Error('User is not on whitelist to claim RAFT!');
    }

    const { gasLimitMultiplier = Decimal.ONE } = options;
    const index = BigInt(this.merkleTreeIndex);
    const amount = this.claimableAmount.toBigInt(Decimal.PRECISION);

    const { sendTransaction } = await buildTransactionWithGasLimit(
      this.airdropContract.claim,
      [index, this.walletAddress, amount, this.merkleProof],
      signer,
      gasLimitMultiplier,
      'raft',
    );

    return sendTransaction();
  }

  public async claimRaftFromStakedBpt(
    signer: Signer,
    options: TransactionWithFeesOptions = {},
  ): Promise<TransactionResponse> {
    const { gasLimitMultiplier = Decimal.ONE } = options;

    if (!this.walletAddress) {
      throw new Error('Wallet is not connected to RaftToken');
    }

    const { sendTransaction } = await buildTransactionWithGasLimit(
      this.feeDistributorContract.claimToken,
      [this.walletAddress, RaftConfig.networkConfig.tokens.RAFT.address],
      signer,
      gasLimitMultiplier,
      'raft',
    );

    return sendTransaction();
  }

  public async stakeBptForVeRaft(bptAmount: Decimal, unlockTime: Date, signer: Signer): Promise<TransactionResponse> {
    const amount = bptAmount.toBigInt(Decimal.PRECISION);
    const unlockTimestamp = BigInt(Math.floor(unlockTime.getTime() / 1000));
    const txnRequest = await this.veContract.create_lock.populateTransaction(amount, unlockTimestamp);
    return signer.sendTransaction(txnRequest);
  }

  public async increaseStakeBptForVeRaft(bptAmount: Decimal, signer: Signer): Promise<TransactionResponse> {
    const amount = bptAmount.toBigInt(Decimal.PRECISION);
    const txnRequest = await this.veContract.increase_amount.populateTransaction(amount);
    return signer.sendTransaction(txnRequest);
  }

  public async extendStakeBptForVeRaft(unlockTime: Date, signer: Signer): Promise<TransactionResponse> {
    const unlockTimestamp = BigInt(Math.floor(unlockTime.getTime() / 1000));
    const txnRequest = await this.veContract.increase_unlock_time.populateTransaction(unlockTimestamp);
    return signer.sendTransaction(txnRequest);
  }

  public async increaseAndExtendStakeBptForVeRaft(
    bptAmount: Decimal,
    unlockTime: Date,
    signer: Signer,
  ): Promise<TransactionResponse> {
    const amount = bptAmount.toBigInt(Decimal.PRECISION);
    const unlockTimestamp = BigInt(Math.floor(unlockTime.getTime() / 1000));
    const txnRequest = await this.veContract.increase_amount_and_time.populateTransaction(amount, unlockTimestamp);
    return signer.sendTransaction(txnRequest);
  }

  public async withdrawVeRaft(signer: Signer): Promise<TransactionResponse> {
    const txnRequest = await this.veContract.withdraw.populateTransaction();
    return signer.sendTransaction(txnRequest);
  }

  public static isExtendingStakeBpt(currentUnlockedTime: Date, unlockTime: Date): boolean {
    const currentUnlockedTimeInSecond = Math.floor(currentUnlockedTime.getTime() / 1000);
    const unlockTimeInSecond = Math.floor(unlockTime.getTime() / 1000);
    const roundedUnlockTimeInSecond = Math.floor(unlockTimeInSecond / SECONDS_IN_WEEK) * SECONDS_IN_WEEK;

    return roundedUnlockTimeInSecond > currentUnlockedTimeInSecond;
  }
}
