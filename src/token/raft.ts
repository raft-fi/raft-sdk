import { SubgraphPoolBase, WeightedPool } from '@balancer-labs/sor';
import { BigNumber } from 'bignumber.js';
import { Decimal } from '@tempusfinance/decimal';
import { Contract, Provider, Signer, TransactionResponse } from 'ethers';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import request, { gql } from 'graphql-request';
import { RaftConfig } from '../config';
import {
  ERC20,
  ERC20Permit,
  ERC20Permit__factory,
  MerkleDistributor,
  MerkleDistributor__factory,
  VotingEscrow,
  VotingEscrow__factory,
} from '../typechain';
import {
  buildTransactionWithGasLimit,
  createEmptyPermitSignature,
  createPermitSignature,
  getApproval,
  isEoaAddress,
} from '../utils';
import { TransactionWithFeesOptions } from '../types';
import { ERC20PermitSignatureStruct } from '../typechain/PositionManager';

// annual give away = 10% of 1B evenly over 3 years
const ANNUAL_GIVE_AWAY = new Decimal(1000000000).mul(0.1).div(3);

const TOKEN_APPROVAL_BUFFER = 0.01;

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

type WhitelistAddress = string;
type WhitelistClaimAmount = string;
type WhitelistItem = [WhitelistAddress, WhitelistClaimAmount];

export class RaftToken {
  private provider: Provider;
  private walletAddress: string;
  private tokenContract: ERC20Permit;
  private veContract: VotingEscrow;
  private airdropContract: MerkleDistributor;
  private claimAndStakeContract: Contract;
  private balancerPoolLPTokenContract: ERC20Permit;
  private merkleTree?: StandardMerkleTree<string[]>;
  private merkleProof?: string[] | null;
  private merkleTreeIndex?: number | null;
  private claimableAmount: Decimal = Decimal.ZERO;

  public constructor(walletAddress: string, provider: Provider) {
    this.provider = provider;
    this.walletAddress = walletAddress;
    this.tokenContract = ERC20Permit__factory.connect(RaftConfig.networkConfig.raftTokenAddress, provider);
    this.veContract = VotingEscrow__factory.connect(RaftConfig.networkConfig.veRaftAddress, provider);
    this.balancerPoolLPTokenContract = ERC20Permit__factory.connect(
      RaftConfig.networkConfig.balancerPoolLPTokenAddress,
      provider,
    );

    // TODO: update ABI for RAFT airdrop contract
    // https://github.com/raft-fi/raft-staking/blob/master/contracts/dependencies/IMerkleDistributor.sol
    this.airdropContract = MerkleDistributor__factory.connect(RaftConfig.networkConfig.raftAirdropAddress, provider);

    // TODO: set ClaimRaftAndStake contract
    // https://github.com/raft-fi/raft-staking/blob/master/contracts/ClaimRaftAndStake.sol
    this.claimAndStakeContract = new Contract(
      RaftConfig.networkConfig.claimRaftStakeVeRaftAddress,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [] as any,
      provider,
    );
  }

  public setWhitelist(items: WhitelistItem[]): void {
    if (!this.merkleTree) {
      this.merkleTree = StandardMerkleTree.of(items, ['address', 'uint256']);

      const index = items.findIndex(([address]) => address === this.walletAddress);
      if (index >= 0) {
        const found = items[index];
        const [, amount] = found;

        this.merkleTreeIndex = index;
        this.merkleProof = this.merkleTree.getProof(index);
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

  private getVeRaftBalance(point: VeRaftBalancePoint, supplyAtTimestamp: number): bigint {
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

    const totalSupply = this.getVeRaftBalance(lastPoint, currentTimeInSecond + stakePeriodInSecond / 2);
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
   * @param stakeAmount The stake amount of RAFT.
   * @param options.poolData The balancer pool data. If not provided, will query.
   * @returns The estimated price impact for the RAFT staking.
   */
  public async calculatePriceImpact(stakeAmount: Decimal, options: PoolDataOption = {}): Promise<Decimal | null> {
    let { poolData } = options;

    if (!poolData) {
      poolData = await this.getBalancerPoolData();
    }

    if (!poolData) {
      return null;
    }

    const pool = WeightedPool.fromPool(poolData);
    const poolPairData = pool.parsePoolPairData(poolData.tokensList[0], poolData.tokensList[1]);
    const tokenIn = new BigNumber(stakeAmount.toString());

    // https://docs.balancer.fi/guides/arbitrageurs/get-spot-price.html
    // current spot price
    const priceBefore = pool._spotPriceAfterSwapExactTokenInForTokenOut(poolPairData, new BigNumber(0));
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

  private async calculateBptOutGivenExactRaftIn(
    stakeAmount: Decimal,
    options: PoolDataOption = {},
  ): Promise<BigNumber | null> {
    let { poolData } = options;

    if (!poolData) {
      poolData = await this.getBalancerPoolData();
    }

    if (!poolData) {
      return null;
    }

    const pool = WeightedPool.fromPool(poolData);
    const poolPairData = pool.parsePoolPairData(poolData.tokensList[0], poolData.tokensList[1]);
    const tokenIn = new BigNumber(stakeAmount.toString());

    return pool._exactTokenInForTokenOut(poolPairData, tokenIn);
  }

  public async claim(signer: Signer, options: TransactionWithFeesOptions = {}): Promise<TransactionResponse> {
    if (this.merkleTreeIndex === null || this.merkleTreeIndex === undefined || !this.merkleProof) {
      throw new Error('User is not on whitelist to claim!');
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

  public async stake(period: Decimal): Promise<TransactionResponse | null> {
    // TODO: lock RAFT/ETH LP token to get veRAFT
    // https://github.com/balancer/balancer-v2-monorepo/blob/master/pkg/liquidity-mining/contracts/VotingEscrow.vy
    // - create_lock
    // - increase_amount
    // - increase_unlock_time
    period;
    return null;
  }

  public async claimAndStake(
    period: Decimal,
    slippage: Decimal,
    signer: Signer,
    options: TransactionWithFeesOptions = {},
  ): Promise<TransactionResponse | null> {
    if (this.merkleTreeIndex === null || this.merkleTreeIndex === undefined || !this.merkleProof) {
      throw new Error('User is not on whitelist to claim!');
    }

    const { gasLimitMultiplier = Decimal.ONE } = options;
    const index = BigInt(this.merkleTreeIndex);
    const amount = this.claimableAmount.toBigInt(Decimal.PRECISION);

    const poolData = await this.getBalancerPoolData();
    const bptOutGivenExactRaftIn = await this.calculateBptOutGivenExactRaftIn(this.claimableAmount.mul(period), {
      poolData,
    });

    if (!poolData || !bptOutGivenExactRaftIn) {
      throw new Error('Cannot query balancer pool data!');
    }

    // minBptAmountOut = calculated BPT out * (1 - slippage)
    const minBptAmountOut = new Decimal(bptOutGivenExactRaftIn.toString()).mul(Decimal.ONE.sub(slippage));
    // approvalAmount = calculated BPT out * (1 + buffer)
    const approvalAmount = new Decimal(bptOutGivenExactRaftIn.toString()).mul(Decimal.ONE.add(TOKEN_APPROVAL_BUFFER));

    let raftTokenPermitSignature = createEmptyPermitSignature();
    let balancerLPTokenPermitSignature = createEmptyPermitSignature();
    const isEoaWallet = await isEoaAddress(this.walletAddress, this.provider);

    // if wallet is EOA, use approval; else use permit
    if (isEoaWallet) {
      // approve $RAFT token for approval amount
      await this.getApproval(
        approvalAmount,
        this.tokenContract as ERC20,
        RaftConfig.networkConfig.claimRaftStakeVeRaftAddress,
      );
      // approve LP token for approval amount
      await this.getApproval(
        approvalAmount,
        this.balancerPoolLPTokenContract as ERC20,
        RaftConfig.networkConfig.claimRaftStakeVeRaftAddress,
      );
    } else {
      // sign permit for $RAFT token for approval amount
      raftTokenPermitSignature = await this.getPermit(
        approvalAmount,
        signer,
        this.tokenContract,
        RaftConfig.networkConfig.claimRaftStakeVeRaftAddress,
      );
      // sign permit for LP token for approval amount
      balancerLPTokenPermitSignature = await this.getPermit(
        approvalAmount,
        signer,
        this.balancerPoolLPTokenContract,
        RaftConfig.networkConfig.claimRaftStakeVeRaftAddress,
      );
    }

    const { sendTransaction } = await buildTransactionWithGasLimit(
      this.claimAndStakeContract.execute,
      [
        index,
        this.walletAddress,
        amount,
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

  private async getPermit(
    amount: Decimal,
    signer: Signer,
    tokenContract: ERC20Permit,
    spender: string,
  ): Promise<ERC20PermitSignatureStruct> {
    return createPermitSignature(signer, amount, spender, tokenContract);
  }

  private async getApproval(amount: Decimal, tokenContract: ERC20, spender: string): Promise<void> {
    return getApproval(amount, this.walletAddress, tokenContract, spender);
  }
}
