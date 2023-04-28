import Decimal from '@tempusfinance/decimal';
import { Contract, Provider } from 'ethers';
import { COLLATERAL_TOKEN_ADDRESSES, POSITION_MANAGER_ADDRESS } from '../constants';
import { PositionManager, PositionManager__factory } from '../typechain';
import { CollateralTokenType } from '../types';

type PriceFeedsMap = Partial<Record<CollateralTokenType, Contract>>;

export class PriceFeed {
  private provider: Provider;
  private positionManager: PositionManager;
  private priceFeeds: PriceFeedsMap;

  public constructor(provider: Provider) {
    this.provider = provider;
    this.positionManager = PositionManager__factory.connect(POSITION_MANAGER_ADDRESS, provider);
    this.priceFeeds = {};
  }

  public async getPrice(collateralTokenType: CollateralTokenType) {
    const priceFeed = await this.getPriceFeed(collateralTokenType);
    const price = await priceFeed.getPrice(); // TODO: replace with lastGoodPrice for mainnet
    return new Decimal(price);
  }

  private async getPriceFeed(collateralTokenType: CollateralTokenType): Promise<Contract> {
    if (this.priceFeeds[collateralTokenType] === undefined) {
      const priceFeedAddress = await this.positionManager.priceFeeds(COLLATERAL_TOKEN_ADDRESSES[collateralTokenType]);

      this.priceFeeds[collateralTokenType] = new Contract(
        priceFeedAddress,
        ['function getPrice() view returns (uint256)'],
        this.provider,
      );
    }

    return this.priceFeeds[collateralTokenType] as Contract;
  }
}
