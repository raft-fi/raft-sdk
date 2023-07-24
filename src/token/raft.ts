import { Decimal } from '@tempusfinance/decimal';
import { Provider } from 'ethers';
import { ERC20__factory } from '../typechain';

// annual give away = 10% of 1B evenly over 3 years
const ANNUAL_GIVE_AWAY = new Decimal(1000000000).mul(0.1).div(3);

type EstimateAprOption = {
  veRaftTotalSupply?: Decimal;
  annualGiveAway?: Decimal;
};

export class RaftToken {
  private provider: Provider;
  private walletAddress: string;

  public constructor(walletAddress: string, provider: Provider) {
    this.provider = provider;
    this.walletAddress = walletAddress;
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
    // TODO: change this to veRAFT contract
    const contract = ERC20__factory.connect('0x183015a9ba6ff60230fdeadc3f43b3d788b13e21', this.provider);
    return new Decimal(await contract.totalSupply(), Decimal.PRECISION);
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
   * @returns The collateral ratio. If the debt is 0, returns the maximum decimal value (represents infinity).
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
