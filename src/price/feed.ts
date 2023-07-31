import { Decimal } from '@tempusfinance/decimal';
import { Contract, Provider } from 'ethers';
import { request, gql } from 'graphql-request';
import { RaftConfig } from '../config';
import { Token, UnderlyingCollateralToken } from '../types';
import { SUBGRAPH_PRICE_PRECISION } from '../constants';
import { SubgraphPriceFeedToken, SupportedCollateralTokens } from '../config/types';
import { isUnderlyingCollateralToken } from '../utils';

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
    const { priceFeed } = RaftConfig.networkConfig.tokens[token];

    if (priceFeed instanceof Decimal) {
      return priceFeed;
    }

    if (typeof priceFeed === 'string' && isUnderlyingCollateralToken(priceFeed)) {
      return this.fetchPriceFromPriceFeed(priceFeed);
    }

    const { ticker, fallbackToken, getFallbackRate } = priceFeed;

    try {
      return await this.fetchSubgraphPrice(ticker);
    } catch (e) {
      const fallbackPrice = await this.getPrice(fallbackToken);
      const rate = await getFallbackRate(this.provider);
      return fallbackPrice.mul(rate);
    }
  }

  /**
   * This function provides conversion rate from any supported underlying token to any supported
   * collateral token.
   * @param underlyingCollateral Underlying collateral token which rate converts from.
   * @param collateralToken Collateral token which rate converts to.
   * @returns Conversion rate from underlying collateral token to collateral token.
   */
  public async getUnderlyingCollateralRate<U extends UnderlyingCollateralToken>(
    _underlyingCollateral: U,
    collateralToken: SupportedCollateralTokens[U],
  ): Promise<Decimal> {
    const { priceFeed } = RaftConfig.networkConfig.tokens[collateralToken];

    if (priceFeed instanceof Decimal || (typeof priceFeed === 'string' && isUnderlyingCollateralToken(priceFeed))) {
      return Decimal.ONE;
    }

    return priceFeed.getFallbackRate(this.provider);
  }

  private async fetchPriceFromPriceFeed(token: UnderlyingCollateralToken): Promise<Decimal> {
    const priceFeedAddress = RaftConfig.networkConfig.priceFeeds[token];
    if (priceFeedAddress === '') {
      console.warn(`Price feed for collateral token ${token} is not set in config!`);
      return Decimal.ZERO;
    }

    const priceFeed = await this.loadPriceFeed(token);

    // In case of tokens that don't have 18-decimal precision, we need to adjust the precision of the
    // price feed result.
    const decimals = 2 * Decimal.PRECISION - RaftConfig.networkConfig.tokens[token].decimals;

    if (RaftConfig.isTestNetwork) {
      return new Decimal(await priceFeed.getPrice.staticCall(), decimals);
    } else {
      return new Decimal(await priceFeed.lastGoodPrice.staticCall(), decimals);
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

  private async fetchSubgraphPrice(token: SubgraphPriceFeedToken): Promise<Decimal> {
    const query = gql`
      query getTokenPrice($token: String!) {
        price(id: $token) {
          value
        }
      }
    `;
    const variables = {
      token,
    };

    const response = await request<{ price: PriceQueryResponse }>(RaftConfig.subgraphEndpoint, query, variables);

    return new Decimal(BigInt(response.price.value), SUBGRAPH_PRICE_PRECISION);
  }
}
