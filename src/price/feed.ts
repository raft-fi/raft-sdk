import { Decimal } from 'tempus-decimal';
import { Contract, Provider } from 'ethers';
import { COLLATERAL_TOKEN_ADDRESSES, POSITION_MANAGER_ADDRESS } from '../constants';
import { PositionManager, PositionManager__factory } from '../typechain';
import { CollateralTokenType } from '../types';

type PriceFeedsMap = Partial<Record<string, Contract>>;

export class PriceFeed {
  private provider: Provider;
  private positionManager: PositionManager;
  private priceFeeds: PriceFeedsMap;

  public constructor(provider: Provider) {
    this.provider = provider;
    this.positionManager = PositionManager__factory.connect(POSITION_MANAGER_ADDRESS, provider);
    this.priceFeeds = {};
  }

  public async getPrice(token: string): Promise<Decimal> {
    if (token === (await this.positionManager.rToken())) {
      return new Decimal(1e18);
    }
    const priceFeed = await this.getPriceFeed(COLLATERAL_TOKEN_ADDRESSES[CollateralTokenType.WSTETH]);
    const price = await priceFeed.getPrice(); // TODO: replace with lastGoodPrice for mainnet
    return new Decimal(price);
  }

  private async getPriceFeed(token: string): Promise<Contract> {
    if (this.priceFeeds[token] === undefined) {
      const priceFeedAddress = await this.positionManager.priceFeeds(token);

      this.priceFeeds[token] = new Contract(
        priceFeedAddress,
        ['function getPrice() view returns (uint256)'],
        this.provider,
      );
    }

    return this.priceFeeds[token] as Contract;
  }
}
