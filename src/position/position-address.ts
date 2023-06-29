import { Decimal } from '@tempusfinance/decimal';
import { ContractTransactionResponse, Provider, Signer } from 'ethers';
import { RaftConfig } from '../config';
import { PositionManager__factory } from '../typechain';
import { UnderlyingCollateralToken } from '../types';
import { PositionWithRunner } from './base';

/**
 * A position with an attached address that is the position's owner address. This class is used for read-only
 * operations on the position (e.g. reading position details for liquidation). Also, it is possible to liquidate this
 * position. For operations that require a signer (e.g. managing collateral and debt), use the {@link UserPosition}
 * class.
 */
export class PositionWithAddress extends PositionWithRunner {
  /**
   * Creates a new representation of a position with the attached address and given initial collateral and debt amounts.
   * @param userAddress The address of the owner of the position.
   * @param provider The blockchain provider.
   * @param underlyingCollateralToken The underlying collateral token.
   * @param collateral The collateral amount. Defaults to 0.
   * @param debt The debt amount. Defaults to 0.
   */
  public constructor(
    userAddress: string,
    provider: Provider,
    underlyingCollateralToken: UnderlyingCollateralToken,
    collateral: Decimal = Decimal.ZERO,
    debt: Decimal = Decimal.ZERO,
  ) {
    super(userAddress, provider, underlyingCollateralToken, collateral, debt);
  }

  /**
   * Liquidates the position. The liquidator has to have enough R to repay the debt of the position.
   * @param liquidator The signer of the liquidator.
   * @returns The dispatched transaction of the liquidation.
   */
  public async liquidate(liquidator: Signer): Promise<ContractTransactionResponse> {
    const positionManager = PositionManager__factory.connect(RaftConfig.networkConfig.positionManager, liquidator);
    return positionManager.liquidate(this.userAddress);
  }
}
