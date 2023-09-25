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
  MerkleDistributor,
  MerkleDistributor__factory,
  VotingEscrow,
  VotingEscrow__factory,
} from '../typechain';
import {
  EMPTY_PERMIT_SIGNATURE,
  buildTransactionWithGasLimit,
  createPermitSignature,
  getApproval,
  getTokenContract,
  isEoaAddress,
} from '../utils';
import { RAFT_BPT_TOKEN, RAFT_TOKEN, TransactionWithFeesOptions } from '../types';

// annual give away = 10% of 1B evenly over 3 years
const ANNUAL_GIVE_AWAY = new Decimal(1000000000).mul(0.1).div(3);

type EstimateAprOption = {
  veRaftAvgTotalSupply?: Decimal;
  annualGiveAway?: Decimal;
};

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
  private veContract: VotingEscrow;
  private raftBptContract: ERC20Permit;
  private airdropContract: MerkleDistributor;
  private claimAndStakeContract: ClaimRaftAndStake;
  private merkleTree?: WhitelistMerkleTree;
  private merkleProof?: WhitelistMerkleProof | null;
  private merkleTreeIndex?: number | null;
  private claimableAmount: Decimal = Decimal.ZERO;
  private minVeLockPeriod?: number | null;
  private maxVeLockPeriod?: number | null;

  public constructor(walletAddress: string, provider: Provider) {
    this.provider = provider;
    this.walletAddress = walletAddress;
    this.veContract = VotingEscrow__factory.connect(RaftConfig.networkConfig.veRaftAddress, provider);
    this.raftBptContract = getTokenContract(RAFT_BPT_TOKEN, this.provider);
    this.airdropContract = MerkleDistributor__factory.connect(RaftConfig.networkConfig.raftAirdropAddress, provider);
    this.claimAndStakeContract = ClaimRaftAndStake__factory.connect(
      RaftConfig.networkConfig.claimRaftStakeVeRaftAddress,
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
   * @param period The period, in year.
   * @returns Total supply of veRAFT.
   */
  public async fetchVeRaftAvgTotalSupply(period: number): Promise<Decimal> {
    const stakePeriodInSecond = period * 365 * 24 * 60 * 60;
    const currentTimeInSecond = Math.floor(Date.now() / 1000);

    const epoch = await this.veContract.epoch();
    const lastPoint = (await this.veContract.point_history(epoch)) as VeRaftBalancePoint;

    const totalSupply = this.getTotalVeRaftBalanceFromPoint(lastPoint, currentTimeInSecond + stakePeriodInSecond / 2);
    return new Decimal(totalSupply, Decimal.PRECISION);
  }

  /**
   * Returns the number of annual give away of RAFT.
   * @returns The annual give away of RAFT.
   */
  public getAnnualGiveAway(): Decimal {
    return ANNUAL_GIVE_AWAY;
  }

  /**
   * Returns the min lock period for veRAFT, in second.
   * @returns The min lock period for veRAFT, in second.
   */
  public async getMinVeLockPeriod(): Promise<number | null> {
    if (!this.minVeLockPeriod && this.minVeLockPeriod !== 0) {
      this.minVeLockPeriod = Number(await this.veContract.MINTIME());
    }

    return this.minVeLockPeriod;
  }

  /**
   * Returns the max lock period for veRAFT, in second.
   * @returns The max lock period for veRAFT, in second.
   */
  public async getMaxVeLockPeriod(): Promise<number | null> {
    if (!this.maxVeLockPeriod && this.maxVeLockPeriod !== 0) {
      this.maxVeLockPeriod = Number(await this.veContract.MAXTIME());
    }

    return this.maxVeLockPeriod;
  }

  /**
   * Returns the estimated staking APR for the input.
   * @param stakeAmount The stake amount of RAFT.
   * @param period The period, in year.
   * @param options.veRaftAvgTotalSupply The avg total supply of veRAFT. If not provided, will query.
   * @param options.annualGiveAway The annual give away of RAFT. If not provided, will query.
   * @returns The estimated staking APR.
   */
  public async estimateStakingApr(
    stakeAmount: Decimal,
    period: number,
    options: EstimateAprOption = {},
  ): Promise<Decimal> {
    let { veRaftAvgTotalSupply, annualGiveAway } = options;

    if (!veRaftAvgTotalSupply) {
      veRaftAvgTotalSupply = await this.fetchVeRaftAvgTotalSupply(period);
    }

    if (!annualGiveAway) {
      annualGiveAway = this.getAnnualGiveAway();
    }

    // avg veRAFT = staked RAFT * period / 2
    const newVeRaftAvgAmount = stakeAmount.mul(period).div(2);
    const newVeRaftAvgTotalAmount = veRaftAvgTotalSupply.add(newVeRaftAvgAmount);

    // estimated APR = new avg veRAFT / total avg veRAFT * annual give away / staked RAFT
    return newVeRaftAvgAmount.div(newVeRaftAvgTotalAmount).mul(annualGiveAway).div(stakeAmount);
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

  public async getUserBptAllowance(): Promise<Decimal> {
    const tokenAllowance = await this.raftBptContract.allowance(
      this.walletAddress,
      RaftConfig.networkConfig.veRaftAddress,
    );
    return new Decimal(tokenAllowance, Decimal.PRECISION);
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
        bptTokenContract.approve(RaftConfig.networkConfig.veRaftAddress, bptAmount.toBigInt(Decimal.PRECISION));

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
      gasLimitMultiplier,
      'raft',
      signer,
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
        // 120% amount of calculated BPT amount
        //new Decimal(minBptAmountOut.toString()).mul(1.2),
        Decimal.MAX_DECIMAL,
        this.walletAddress,
        bptTokenContract as ERC20,
        RaftConfig.networkConfig.veRaftAddress,
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
        RaftConfig.networkConfig.veRaftAddress,
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
      gasLimitMultiplier,
      'raft',
      signer,
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
