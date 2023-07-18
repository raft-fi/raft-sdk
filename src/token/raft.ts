import { Decimal } from '@tempusfinance/decimal';

export class RaftToken {
  private walletAddress: string;

  public constructor(walletAddress: string) {
    this.walletAddress = walletAddress;
  }

  public async isEligibleToClaim(): Promise<boolean> {
    // TODO: dummy implementation
    return true;
  }

  public async hasAlreadyClaimed(): Promise<boolean> {
    // TODO: dummy implementation
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
    // TODO: dummy implementation
    return Decimal.ZERO;
  }

  public async claim(): Promise<void> {
    // TODO: dummy implementation
    return;
  }

  public async stake(period: Decimal): Promise<void> {
    // TODO: dummy implementation
    period;
    return;
  }

  public async claimAndStake(period: Decimal): Promise<void> {
    // TODO: dummy implementation
    period;
    return;
  }
}
