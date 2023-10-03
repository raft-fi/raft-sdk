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
  ERC20,
  ERC20Permit,
  FeeDistributor,
  FeeDistributor__factory,
  MerkleDistributor,
  MerkleDistributor__factory,
  VotingEscrow,
} from '../typechain';
import {
  EMPTY_PERMIT_SIGNATURE,
  buildTransactionWithGasLimit,
  createPermitSignature,
  getApproval,
  getTokenContract,
  isEoaAddress,
} from '../utils';
import { RAFT_BPT_TOKEN, RAFT_TOKEN, TransactionWithFeesOptions, VERAFT_TOKEN } from '../types';
import { SECONDS_IN_WEEK, SECONDS_PER_YEAR } from '../constants';

// annual give away = 10% of 1B evenly over 3 years
const ANNUAL_GIVE_AWAY = new Decimal(1000000000).mul(0.1).div(3);

type PoolDataOption = {
  poolData?: SubgraphPoolBase | null;
};

type PoolDataQuery = {
  pool: SubgraphPoolBase | null;
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
  supply: Decimal;
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
  bptLockedBalance?: Decimal;
  veRaftBalance?: Decimal;
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
export type StakeBptStepType = 'approve' | 'stake-new' | 'stake-increase' | 'stake-extend';
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
  private walletAddress: string;
  private raftContract: ERC20Permit;
  private veContract: VotingEscrow;
  private raftBptContract: ERC20Permit;
  private airdropContract: MerkleDistributor;
  private claimAndStakeContract: ClaimRaftAndStake;
  private feeDistributorContract: FeeDistributor;
  private merkleTree?: WhitelistMerkleTree;
  private merkleProof?: WhitelistMerkleProof | null;
  private merkleTreeIndex?: number | null;
  private claimableAmount: Decimal = Decimal.ZERO;
  private annualGiveAway: Decimal = ANNUAL_GIVE_AWAY;
  private minVeLockPeriod?: number | null;
  private maxVeLockPeriod?: number | null;

  public constructor(walletAddress: string, provider: Provider) {
    this.provider = provider;
    this.walletAddress = walletAddress;
    this.raftContract = getTokenContract(RAFT_TOKEN, this.provider);
    this.veContract = getTokenContract(VERAFT_TOKEN, provider);
    this.raftBptContract = getTokenContract(RAFT_BPT_TOKEN, this.provider);
    this.airdropContract = MerkleDistributor__factory.connect(RaftConfig.networkConfig.raftAirdropAddress, provider);
    this.claimAndStakeContract = ClaimRaftAndStake__factory.connect(
      RaftConfig.networkConfig.claimRaftStakeVeRaftAddress,
      provider,
    );
    this.feeDistributorContract = FeeDistributor__factory.connect(
      RaftConfig.networkConfig.feeDistributorAddress,
      provider,
    );
  }

  public setWhitelist(merkleTree: WhitelistMerkleTree): void {
    if (!this.merkleTree) {
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

  private getTotalVeRaftBalanceFromPoint(point: VeRaftBalancePoint, supplyAtTimestamp: number): bigint {
    return point.bias + point.slope * (BigInt(supplyAtTimestamp) - point.ts);
  }

  /**
   * Returns the avg total supply of veRAFT.
   * @param unlockTime The unlock time for the staking.
   * @returns Total supply of veRAFT.
   */
  public async fetchVeRaftAvgTotalSupply(unlockTime: Date): Promise<Decimal> {
    const currentTimeInSecond = Math.floor(Date.now() / 1000);
    const avgStakingPeriodInSecond = Math.floor((Math.floor(unlockTime.getTime() / 1000) - currentTimeInSecond) / 2);

    if (avgStakingPeriodInSecond <= 0) {
      return Decimal.ZERO;
    }

    const epoch = await this.veContract.epoch();
    const lastPoint = (await this.veContract.point_history(epoch)) as VeRaftBalancePoint;

    const totalSupply = this.getTotalVeRaftBalanceFromPoint(lastPoint, currentTimeInSecond + avgStakingPeriodInSecond);
    return new Decimal(totalSupply, Decimal.PRECISION);
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
   * @param options.bptLockedBalance Current staked BPT amount
   * @param options.veRaftBalance Current veRaft position
   * @returns The estimated staking APR.
   */
  public async estimateStakingApr(
    bptAmount: Decimal,
    unlockTime: Date,
    options: AprEstimationOptions = {},
  ): Promise<Decimal> {
    let { bptLockedBalance, veRaftBalance } = options;

    const stakingPeriodInSecond = Math.floor((unlockTime.getTime() - Date.now()) / 1000);

    if (stakingPeriodInSecond <= 0) {
      return Decimal.ZERO;
    }

    if (!bptLockedBalance || !veRaftBalance) {
      const balance = await this.getUserVeRaftBalance();
      bptLockedBalance = balance.bptLockedBalance;
      veRaftBalance = balance.veRaftBalance;
    }

    const [veRaftAvgTotalSupply, maxVeLockPeriod] = await Promise.all([
      this.fetchVeRaftAvgTotalSupply(unlockTime),
      this.getMaxVeLockPeriod(),
    ]);
    const annualGiveAway = this.getAnnualGiveAway();

    if (maxVeLockPeriod <= 0 || annualGiveAway.isZero()) {
      return Decimal.ZERO;
    }

    const periodPortion = stakingPeriodInSecond / maxVeLockPeriod;
    const numOfYear = maxVeLockPeriod / SECONDS_PER_YEAR;

    // since veRAFT decrease in linear, avg veRAFT = veRAFT /2

    // avg veRAFT = staked BPT * period portion / 2
    const newVeRaftAvgAmount = bptAmount.mul(periodPortion).div(2);
    const currentVeRaftAvgAmount = veRaftBalance.div(2);
    const userVeRaftAvgAmount = newVeRaftAvgAmount.add(currentVeRaftAvgAmount);
    const newVeRaftAvgTotalAmount = veRaftAvgTotalSupply.add(newVeRaftAvgAmount);
    const userTotalBptAmount = bptAmount.add(bptLockedBalance);

    // estimated APR = user avg veRAFT / total avg veRAFT * annual give away / staked BPT / number of year
    return userVeRaftAvgAmount.div(newVeRaftAvgTotalAmount).mul(annualGiveAway).div(userTotalBptAmount).div(numOfYear);
  }

  public async getBalancerPoolData(): Promise<SubgraphPoolBase | null> {
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

    return response.pool ?? null;
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
    const tokenIn = new OldBigNumber(raftAmount.toString());

    // https://docs.balancer.fi/guides/arbitrageurs/get-spot-price.html
    // current spot price
    const priceBefore = pool._spotPriceAfterSwapExactTokenInForTokenOut(poolPairData, new OldBigNumber(0));
    // spot price after
    const priceAfter = pool._spotPriceAfterSwapExactTokenInForTokenOut(poolPairData, tokenIn);

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

  public async getUserVeRaftBalance(): Promise<UserVeRaftBalance> {
    const [lockedBalance, veRaftBalance, totalSupply] = await Promise.all([
      this.veContract.locked(this.walletAddress) as Promise<BptLockedBalance>,
      this.veContract.balanceOf(this.walletAddress) as Promise<bigint>,
      this.veContract.totalSupply(),
    ]);

    return {
      bptLockedBalance: new Decimal(lockedBalance.amount, Decimal.PRECISION),
      veRaftBalance: new Decimal(veRaftBalance, Decimal.PRECISION),
      unlockTime: lockedBalance.end ? new Date(Number(lockedBalance.end) * 1000) : null,
      supply: new Decimal(totalSupply, Decimal.PRECISION),
    };
  }

  public async getUserBptBalance(): Promise<Decimal> {
    const balance = await this.raftBptContract.balanceOf(this.walletAddress);
    return new Decimal(balance, Decimal.PRECISION);
  }

  public async getUserRaftAllowance(): Promise<Decimal> {
    const tokenAllowance = await this.raftContract.allowance(
      this.walletAddress,
      RaftConfig.networkConfig.claimRaftStakeVeRaftAddress,
    );
    return new Decimal(tokenAllowance, Decimal.PRECISION);
  }

  public async getUserBptAllowance(): Promise<Decimal> {
    const tokenAllowance = await this.raftBptContract.allowance(
      this.walletAddress,
      RaftConfig.networkConfig.tokens.veRAFT.address,
    );
    return new Decimal(tokenAllowance, Decimal.PRECISION);
  }

  public async getClaimableRaftFromStakedBpt(): Promise<Decimal> {
    const amount = await this.feeDistributorContract.claimToken.staticCall(
      this.walletAddress,
      RaftConfig.networkConfig.tokens.RAFT.address,
    );

    return new Decimal(amount, Decimal.PRECISION);
  }

  public async *getClaimRaftAndStakeBptSteps(
    unlockTime: Date,
    slippage: Decimal,
    signer: Signer,
    options: ClaimRaftStakeBptPrefetch & TransactionWithFeesOptions = {},
  ): AsyncGenerator<ClaimRaftStakeBptStep, void, void> {
    const { gasLimitMultiplier = Decimal.ONE } = options;
    let { raftAllowance, bptAllowance } = options;

    if (this.merkleTreeIndex === null || this.merkleTreeIndex === undefined || !this.merkleProof) {
      throw new Error('User is not on whitelist to claim RAFT!');
    }

    if (!raftAllowance) {
      raftAllowance = await this.getUserRaftAllowance();
    }

    if (!bptAllowance) {
      bptAllowance = await this.getUserBptAllowance();
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

      const action = () =>
        bptTokenContract.approve(
          RaftConfig.networkConfig.tokens.veRAFT.address,
          bptBptAmountFromRaft.toBigInt(Decimal.PRECISION),
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
    options: StakeBptPrefetch = {},
  ): AsyncGenerator<StakeBptStep, void, void> {
    let { userVeRaftBalance, bptAllowance } = options;

    if (!bptAllowance) {
      bptAllowance = await this.getUserBptAllowance();
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
      userVeRaftBalance = await this.getUserVeRaftBalance();
    }

    const lockedBptAmount = userVeRaftBalance.bptLockedBalance;
    const currentUnlockedTime = userVeRaftBalance.unlockTime;

    if (lockedBptAmount.isZero()) {
      // new stake
      const action = () => this.stakeBptForVeRaft(bptAmount, unlockTime, signer);

      yield {
        type: 'stake-new',
        action,
      };
    } else {
      if (currentUnlockedTime && currentUnlockedTime.getTime() > unlockTime.getTime()) {
        throw new Error('Unlock time cannot be earlier than the current one');
      }

      if (bptAmount.gt(0)) {
        // increase lock amount
        const action = () => this.increaseStakeBptForVeRaft(bptAmount, signer);

        yield {
          type: 'stake-increase',
          action,
        };
      }

      if (currentUnlockedTime && currentUnlockedTime.getTime() < unlockTime.getTime()) {
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

    const { sendTransaction } = await buildTransactionWithGasLimit(
      this.feeDistributorContract.claimToken,
      [this.walletAddress, RaftConfig.networkConfig.tokens.RAFT.address],
      signer,
      gasLimitMultiplier,
      'raft',
    );

    return sendTransaction();
  }

  public async claimRaftAndStakeBptForVeRaft(
    unlockTime: number,
    slippage: Decimal,
    signer: Signer,
    options: TransactionWithFeesOptions = {},
  ): Promise<TransactionResponse> {
    if (this.merkleTreeIndex === null || this.merkleTreeIndex === undefined || !this.merkleProof) {
      throw new Error('User is not on whitelist to claim RAFT!');
    }

    const { gasLimitMultiplier = Decimal.ONE } = options;
    const index = BigInt(this.merkleTreeIndex);
    const amount = this.claimableAmount.toBigInt(Decimal.PRECISION);

    const poolData = await this.getBalancerPoolData();
    const bptBptAmountFromRaft = await this.getBptAmountFromRaft(this.claimableAmount, {
      poolData,
    });

    if (!poolData || !bptBptAmountFromRaft) {
      throw new Error('Cannot query balancer pool data!');
    }

    // minBptAmountOut = calculated BPT out * (1 - slippage)
    const minBptAmountOut = bptBptAmountFromRaft.mul(Decimal.ONE.sub(slippage));

    const raftTokenContract = getTokenContract(RAFT_TOKEN, signer);
    const bptTokenContract = getTokenContract(RAFT_BPT_TOKEN, signer);

    let raftTokenPermitSignature = EMPTY_PERMIT_SIGNATURE;
    let balancerLPTokenPermitSignature = EMPTY_PERMIT_SIGNATURE;
    const isEoaWallet = await isEoaAddress(this.walletAddress, this.provider);

    // if wallet is EOA, use approval; else use permit
    if (isEoaWallet) {
      // approve $RAFT token for approval amount
      await getApproval(
        this.claimableAmount,
        this.walletAddress,
        raftTokenContract as ERC20,
        RaftConfig.networkConfig.claimRaftStakeVeRaftAddress,
      );
      // approve BPT token for approval amount
      await getApproval(
        bptBptAmountFromRaft,
        this.walletAddress,
        bptTokenContract as ERC20,
        RaftConfig.networkConfig.tokens.veRAFT.address,
      );
    } else {
      // sign permit for $RAFT token for approval amount
      raftTokenPermitSignature = await createPermitSignature(
        RAFT_TOKEN,
        signer,
        this.claimableAmount,
        RaftConfig.networkConfig.claimRaftStakeVeRaftAddress,
        raftTokenContract,
      );
      // sign permit for BPT token for approval amount
      balancerLPTokenPermitSignature = await createPermitSignature(
        RAFT_BPT_TOKEN,
        signer,
        this.claimableAmount,
        RaftConfig.networkConfig.tokens.veRAFT.address,
        bptTokenContract,
      );
    }

    const { sendTransaction } = await buildTransactionWithGasLimit(
      this.claimAndStakeContract.execute,
      [
        index,
        this.walletAddress,
        amount,
        BigInt(unlockTime),
        this.merkleProof,
        minBptAmountOut.toBigInt(Decimal.PRECISION),
        raftTokenPermitSignature,
        balancerLPTokenPermitSignature,
      ],
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

  public async withdrawVeRaft(signer: Signer): Promise<TransactionResponse> {
    const txnRequest = await this.veContract.withdraw.populateTransaction();
    return signer.sendTransaction(txnRequest);
  }
}
