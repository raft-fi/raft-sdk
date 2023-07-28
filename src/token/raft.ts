import { SubgraphPoolBase, WeightedPool } from '@balancer-labs/sor';
import { BigNumber } from '@ethersproject/bignumber';
import { Decimal } from '@tempusfinance/decimal';
import { Provider } from 'ethers';
import request, { gql } from 'graphql-request';
import { RaftConfig } from '../config';
import { ERC20__factory } from '../typechain';

// annual give away = 10% of 1B evenly over 3 years
const ANNUAL_GIVE_AWAY = new Decimal(1000000000).mul(0.1).div(3);

type EstimateAprOption = {
  veRaftTotalSupply?: Decimal;
  annualGiveAway?: Decimal;
};

type PriceImpactOption = {
  poolData?: SubgraphPoolBase | null;
};

type PoolDataQuery = {
  pool: SubgraphPoolBase | null;
};

export class RaftToken {
  private provider: Provider;
  private walletAddress: string;

  public constructor(walletAddress: string, provider: Provider) {
    this.walletAddress = walletAddress;
    this.provider = provider;
  }

  public async isEligibleToClaim(): Promise<boolean> {
    // TODO: from RAFT airdrop contract, provide either address or merkle proof
    return true;
  }

  public async hasAlreadyClaimed(): Promise<boolean> {
    // TODO: from RAFT airdrop contract, provide either address or merkle proof
    return false;
  }

  public async canClaim(): Promise<boolean> {
    const [isEligibleToClaim, hasAlreadyClaimed] = await Promise.all([
      this.isEligibleToClaim(),
      this.hasAlreadyClaimed(),
    ]);
    return isEligibleToClaim && !hasAlreadyClaimed;
  }

  public async getClaimableAmount(): Promise<Decimal> {
    // TODO: from IPFS, provide merkle proof to get this number
    return new Decimal(123456);
  }

  /**
   * Returns the total supply of veRAFT.
   * @returns Total supply of veRAFT.
   */
  public async fetchVeRaftTotalSupply(): Promise<Decimal> {
    const veRAFTAddress = RaftConfig.raftTokenConfig.veRaftAddress;
    const contract = ERC20__factory.connect(veRAFTAddress, this.provider);
    const totalSupply = await contract.totalSupply();
    return new Decimal(totalSupply, Decimal.PRECISION);
  }

  /**
   * Returns the number of annual give away of RAFT.
   * @returns The annual give away of RAFT.
   */
  public async getAnnualGiveAway(): Promise<Decimal> {
    return ANNUAL_GIVE_AWAY;
  }

  /**
   * Returns the estimated staked APR for the input.
   * @param stakeAmount The staked amount of RAFT.
   * @param period The period, in year.
   * @param options.veRaftTotalSupply The total supply of veRAFT. If not provided, will query.
   * @param options.annualGiveAway The annual give away of RAFT. If not provided, will query.
   * @returns The estimated staked APR.
   */
  public async estimateStakeApr(
    stakeAmount: Decimal,
    period: number,
    options: EstimateAprOption = {},
  ): Promise<Decimal> {
    let { veRaftTotalSupply, annualGiveAway } = options;

    if (!veRaftTotalSupply) {
      veRaftTotalSupply = await this.fetchVeRaftTotalSupply();
    }

    if (!annualGiveAway) {
      annualGiveAway = await this.getAnnualGiveAway();
    }

    // veRAFT = staked RAFT * period
    const newVeRaft = stakeAmount.mul(period);
    const newTotalVeRaft = veRaftTotalSupply.add(newVeRaft);

    // estimated APR = new veRAFT / total veRAFT * annual give away / staked RAFT
    return newVeRaft.div(newTotalVeRaft).mul(annualGiveAway).div(stakeAmount);
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

    const poolId = RaftConfig.raftTokenConfig.balancerPoolId;
    const response = await request<PoolDataQuery>(RaftConfig.balancerSubgraphEndpoint, query, {
      poolId,
    });

    return response.pool ?? null;
  }

  /**
   * Returns the estimated price impact for the RAFT staking.
   * @param stakeAmount The staked amount of RAFT.
   * @param options.poolData The balancer pool data. If not provided, will query.
   * @returns The estimated price impact for the RAFT staking.
   */
  public async calculatePriceImpact(stakeAmount: Decimal, options: PriceImpactOption = {}): Promise<Decimal | null> {
    let { poolData } = options;

    if (!poolData) {
      poolData = await this.getBalancerPoolData();
    }

    if (!poolData) {
      return null;
    }

    const pool = WeightedPool.fromPool(poolData);
    const poolPairData = pool.parsePoolPairData(poolData.tokensList[0], poolData.tokensList[1]);
    const tokenIn = BigNumber.from(stakeAmount.toString());

    // https://docs.balancer.fi/guides/arbitrageurs/get-spot-price.html
    // current spot price
    const priceBefore = pool._spotPriceAfterSwapExactTokenInForTokenOut(poolPairData, BigNumber.from(0));
    // spot price after
    const priceAfter = pool._spotPriceAfterSwapExactTokenInForTokenOut(poolPairData, tokenIn);

    const priceBeforeDecimal = new Decimal(priceBefore.toString(), Decimal.PRECISION);
    const priceAfterDecimal = new Decimal(priceAfter.toString(), Decimal.PRECISION);

    // for BAL/WETH pool, spot price returned is inverted, i.e. price of WETH/BAL
    const invertedPriceBefore = Decimal.ONE.div(priceBeforeDecimal);
    const invertedPriceAfter = Decimal.ONE.div(priceAfterDecimal);

    // price impact = 1 - priceBefore / priceAfter
    const priceImpact = Decimal.ONE.sub(invertedPriceBefore.div(invertedPriceAfter));

    return priceImpact;
  }

  public async claim(): Promise<void> {
    return this.claimAndStake(Decimal.ZERO);
  }

  public async stake(period: Decimal): Promise<void> {
    // TODO: directly interact with balancer v2 pool?
    // https://github.com/balancer/balancer-v2-monorepo/blob/master/pkg/liquidity-mining/contracts/VotingEscrow.vy
    period;
    return;
  }

  public async claimAndStake(period: Decimal): Promise<void> {
    // TODO: from helper contract, to interact to claim and stake in 1 txn
    period;
    return;
  }
}
