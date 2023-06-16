import { Decimal } from '@tempusfinance/decimal';
import { Contract, Provider } from 'ethers';
import { request, gql } from 'graphql-request';
import { RaftConfig } from '../config';
import { CollateralToken, Token, UnderlyingCollateralToken } from '../types';
import { SUBGRAPH_PRICE_PRECISION } from '../constants';
import { CollateralTokenConfig } from '../config/types';

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
    const tokenConfig = RaftConfig.networkConfig.tokens[token];

    if (tokenConfig.hardcodedPrice) {
      return tokenConfig.hardcodedPrice;
    }

    if (tokenConfig.priceFeedTicker) {
      return this.fetchPriceFromPriceFeed(tokenConfig.priceFeedTicker);
    }

    if (tokenConfig.subgraphPriceDataTicker) {
      return this.fetchSubgraphPrice(tokenConfig.subgraphPriceDataTicker);
    }

    // Fetch price using collateral conversion rate which does not apply to R token
    if (token !== 'R') {
      const collateralTokenConfig = this.getTokenCollateralConfig(token);

      if (collateralTokenConfig) {
        let underlyingToCollateralRate: Decimal | null = null;
        if (collateralTokenConfig.underlyingCollateralRate instanceof Decimal) {
          underlyingToCollateralRate = collateralTokenConfig.underlyingCollateralRate;
        } else if (typeof collateralTokenConfig.underlyingCollateralRate === 'function') {
          underlyingToCollateralRate = await collateralTokenConfig.underlyingCollateralRate(
            RaftConfig.getTokenAddress(collateralTokenConfig.underlyingTokenTicker),
            this.provider,
          );
        }

        if (!underlyingToCollateralRate) {
          throw new Error(`Failed to fetch underlying to collateral rate for token ${tokenConfig.ticker}!`);
        }

        const underlyingCollateralPrice = await this.fetchPriceFromPriceFeed(
          collateralTokenConfig.underlyingTokenTicker,
        );

        return underlyingCollateralPrice.div(underlyingToCollateralRate);
      }
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
  public getUnderlyingCollateralRate(
    underlyingCollateral: UnderlyingCollateralToken,
    collateralToken: CollateralToken,
  ): Promise<Decimal> {
    const collateralTokenConfig =
      RaftConfig.networkConfig.underlyingTokens[underlyingCollateral].supportedCollateralTokens[collateralToken];

    if (!collateralTokenConfig) {
      throw new Error(
        `Underlying collateral token ${underlyingCollateral} does not support collateral token ${collateralToken}`,
      );
    }

    if (collateralTokenConfig.underlyingCollateralRate instanceof Decimal) {
      return Promise.resolve(collateralTokenConfig.underlyingCollateralRate);
    }

    return collateralTokenConfig.underlyingCollateralRate(
      RaftConfig.getTokenAddress(collateralTokenConfig.underlyingTokenTicker),
      this.provider,
    );
  }

  private async fetchPriceFromPriceFeed(token: UnderlyingCollateralToken): Promise<Decimal> {
    const priceFeed = await this.loadPriceFeed(token);

    // In case price feed is not defined in config, return price 1
    if (!priceFeed) {
      return Decimal.ONE;
    }

    if (RaftConfig.isTestNetwork) {
      return new Decimal(await priceFeed.getPrice.staticCall());
    } else {
      return new Decimal(await priceFeed.lastGoodPrice.staticCall());
    }
  }

  private async loadPriceFeed(token: UnderlyingCollateralToken): Promise<Contract | null> {
    if (!RaftConfig.networkConfig.priceFeeds[token]) {
      return null;
    }

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

  private async fetchSubgraphPrice(token: Token) {
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

  private getTokenCollateralConfig(token: CollateralToken) {
    let collateralTokenConfig: CollateralTokenConfig | null = null;
    const underlyingTokenList = Object.entries(RaftConfig.networkConfig.underlyingTokens);

    for (const value of Object.values(underlyingTokenList)) {
      const [, config] = value;

      if (config.supportedCollateralTokens[token]) {
        collateralTokenConfig = config.supportedCollateralTokens[token];
      }
    }

    if (!collateralTokenConfig) {
      throw new Error(`Failed to find collateral token config for token ${token}!`);
    }

    return collateralTokenConfig;
  }
}
