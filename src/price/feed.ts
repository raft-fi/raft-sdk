import { Decimal } from 'tempus-decimal';
import { Contract, Provider } from 'ethers';
import { POSITION_MANAGER_ADDRESS, TOKEN_TICKER_ADDRESSES_MAP } from '../constants';
import { PositionManager, PositionManager__factory } from '../typechain';
import { CollateralToken, R_TOKEN, Token } from '../types';

export class PriceFeed {
  private provider: Provider;
  private positionManager: PositionManager;
  private priceFeeds = new Map<CollateralToken, Contract>();

  public constructor(provider: Provider) {
    this.provider = provider;
    this.positionManager = PositionManager__factory.connect(POSITION_MANAGER_ADDRESS, provider);
  }

  public async getPrice(token: Token): Promise<Decimal> {
    if (token === R_TOKEN) {
      return Decimal.ONE;
    }

    const priceFeed = await this.loadPriceFeed('wstETH'); // TODO: replace with real token
    const price = await priceFeed.getPrice(); // TODO: replace with lastGoodPrice for mainnet
    return new Decimal(price);
  }

  private async loadPriceFeed(token: CollateralToken): Promise<Contract> {
    if (!this.priceFeeds.has(token)) {
      const priceFeedAddress = await this.positionManager.priceFeeds(TOKEN_TICKER_ADDRESSES_MAP[token]);
      const contract = new Contract(priceFeedAddress, ['function getPrice() view returns (uint256)'], this.provider);

      this.priceFeeds.set(token, contract);
      return contract;
    }

    return this.priceFeeds.get(token) as Contract;
  }
}
