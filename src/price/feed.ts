import { Decimal } from '@tempusfinance/decimal';
import { Contract, Provider } from 'ethers';
import { RaftConfig } from '../config';
import { CollateralToken, Token, UnderlyingCollateralToken } from '../types';

export type PriceQueryResponse = {
  value: string;
};

export class PriceFeed {
  private provider: Provider;
  private priceFeeds = new Map<UnderlyingCollateralToken, Contract>();

  public constructor(provider: Provider) {
    this.provider = provider;
  }

  public async getPrice(token: Token): Promise<Decimal> {
    const tokenConfig = RaftConfig.networkConfig.tokenTickerToTokenConfigMap[token];

    if (tokenConfig.hardcodedPrice) {
      return tokenConfig.hardcodedPrice;
    }

    if (tokenConfig.priceFeedTicker) {
      return this.fetchPriceFromPriceFeed(tokenConfig.priceFeedTicker);
    }

    if (tokenConfig.underlyingTokenTicker) {
      let underlyingToCollateralRate: Decimal | null = null;
      if (tokenConfig.underlyingCollateralRate instanceof Decimal) {
        underlyingToCollateralRate = tokenConfig.underlyingCollateralRate;
      } else if (typeof tokenConfig.underlyingCollateralRate === 'function') {
        underlyingToCollateralRate = await tokenConfig.underlyingCollateralRate(
          RaftConfig.getTokenAddress(tokenConfig.underlyingTokenTicker),
          this.provider,
        );
      }

      if (!underlyingToCollateralRate) {
        throw new Error(`Failed to fetch underlying to collateral rate for token ${tokenConfig.ticker}!`);
      }

      const underlyingCollateralPrice = await this.fetchPriceFromPriceFeed(tokenConfig.underlyingTokenTicker);

      return underlyingToCollateralRate.mul(underlyingCollateralPrice);
    }

    throw new Error(`Failed to fetch ${token} price!`);
  }

  /**
   * This function provides conversion rate from any supported underlying token to any supported
   * collateral token.
   * @param underlyingCollateral Underlying collateral token which rate converts from.
   * @param collateralToken Collateral token which rate converts to.
   * @returns Conversion rate from underlying collateral token to collateral token.
   */
  public getUnderlyingCollateralRate(token: CollateralToken): Promise<Decimal> {
    const tokenConfig = RaftConfig.networkConfig.tokenTickerToTokenConfigMap[token];

    if (tokenConfig.underlyingCollateralRate instanceof Decimal) {
      return Promise.resolve(tokenConfig.underlyingCollateralRate);
    } else if (typeof tokenConfig.underlyingCollateralRate === 'function') {
      if (!tokenConfig.underlyingTokenTicker) {
        throw new Error(
          `Failed to fetch underlying collateral rate for token ${token} without underlying token ticker!`,
        );
      }

      return tokenConfig.underlyingCollateralRate(
        RaftConfig.getTokenAddress(tokenConfig.underlyingTokenTicker),
        this.provider,
      );
    }

    throw new Error(`Failed to fetch underlying collateral rate for token ${token}!`);
  }

  private async fetchPriceFromPriceFeed(token: UnderlyingCollateralToken): Promise<Decimal> {
    const priceFeed = await this.loadPriceFeed(token);
    if (RaftConfig.isTestNetwork) {
      return new Decimal(await priceFeed.getPrice.staticCall());
    } else {
      return new Decimal(await priceFeed.lastGoodPrice.staticCall());
    }
  }

  private async loadPriceFeed(token: UnderlyingCollateralToken): Promise<Contract> {
    if (!this.priceFeeds.has(token)) {
      const contract = new Contract(
        RaftConfig.networkConfig.priceFeeds[token],
        RaftConfig.isTestNetwork
          ? ['function getPrice() view returns (uint256)']
          : ['function lastGoodPrice() view returns (uint256)'],
        this.provider,
      );

      this.priceFeeds.set(token, contract);
      return contract;
    }

    return this.priceFeeds.get(token) as Contract;
  }
}
