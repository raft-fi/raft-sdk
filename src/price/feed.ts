import { Decimal } from '@tempusfinance/decimal';
import { Contract, Provider } from 'ethers';
import { request, gql } from 'graphql-request';
import { RaftConfig } from '../config';
import { WstETH, WstETH__factory } from '../typechain';
import { CollateralToken, R_TOKEN, Token, UnderlyingCollateralToken } from '../types';
import { SUBGRAPH_PRICE_PRECISION } from '../constants';

export type PriceQueryResponse = {
  value: string;
};

export class PriceFeed {
  private provider: Provider;
  private priceFeeds = new Map<UnderlyingCollateralToken, Contract>();
  private collateralTokens = new Map<UnderlyingCollateralToken, WstETH>();

  public constructor(provider: Provider) {
    this.provider = provider;
  }

  public async getPrice(token: Token): Promise<Decimal> {
    switch (token) {
      case R_TOKEN:
        return Decimal.ONE;

      case 'ETH':
        return this.fetchEthPrice();
      case 'WETH':
        return this.fetchWethPrice();
      case 'stETH':
        return this.fetchStEthPrice();
      case 'wstETH':
        return this.fetchWstEthPrice();
    }
  }

  /**
   * This function provides conversion rate from any supported underlying token to any supported
   * collateral token.
   * @param underlyingCollateral Underlying collateral token which rate converts from.
   * @param collateralToken Collateral token which rate converts to.
   * @returns Conversion rate from underlying collateral token to collateral token.
   */
  public getUnderlyingToCollateralRate(
    underlyingCollateral: UnderlyingCollateralToken,
    collateralToken: CollateralToken,
  ): Promise<Decimal> {
    switch (underlyingCollateral) {
      case 'wstETH':
        switch (collateralToken) {
          case 'stETH':
            return this.getWstEthToStEthRate();
          case 'wstETH':
            return Promise.resolve(Decimal.ONE);
          default:
            throw new Error(
              `Underlying collateral token ${underlyingCollateral} doesn't support collateral token ${collateralToken}!`,
            );
        }
      case 'WETH':
        switch (collateralToken) {
          case 'ETH':
            return Promise.resolve(Decimal.ONE);
          case 'WETH':
            return Promise.resolve(Decimal.ONE);
          default:
            throw new Error(
              `Underlying collateral token ${underlyingCollateral} doesn't support collateral token ${collateralToken}!`,
            );
        }
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

  private async loadCollateralToken(): Promise<WstETH> {
    if (!this.collateralTokens.has('wstETH')) {
      const contract = WstETH__factory.connect(RaftConfig.networkConfig.tokenTickerToAddressMap.wstETH, this.provider);

      this.collateralTokens.set('wstETH', contract);
      return contract;
    }

    return this.collateralTokens.get('wstETH') as WstETH;
  }

  private async fetchSubgraphPrice(token: CollateralToken) {
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

  private async fetchEthPrice(): Promise<Decimal> {
    try {
      if (RaftConfig.isTestNetwork) {
        return this.fetchStEthTestnetPrice();
      }

      return (await this.fetchSubgraphPrice('ETH')) ?? this.fetchWethPrice();
    } catch {
      return this.fetchWethPrice();
    }
  }

  private async fetchWethPrice(): Promise<Decimal> {
    const priceFeed = await this.loadPriceFeed('WETH');
    if (RaftConfig.isTestNetwork) {
      return new Decimal(await priceFeed.getPrice.staticCall());
    } else {
      return new Decimal(await priceFeed.lastGoodPrice.staticCall());
    }
  }

  private async fetchStEthPrice(): Promise<Decimal> {
    try {
      if (RaftConfig.isTestNetwork) {
        return this.fetchStEthTestnetPrice();
      }

      return (await this.fetchSubgraphPrice('stETH')) ?? this.fetchStEthPriceFromBlockchain();
    } catch {
      return this.fetchStEthPriceFromBlockchain();
    }
  }

  private async fetchWstEthPrice(): Promise<Decimal> {
    const priceFeed = await this.loadPriceFeed('wstETH');
    if (RaftConfig.isTestNetwork) {
      return new Decimal(await priceFeed.getPrice.staticCall());
    } else {
      return new Decimal(await priceFeed.lastGoodPrice.staticCall());
    }
  }

  private async fetchStEthPriceFromBlockchain(): Promise<Decimal> {
    const wstEthPrice = await this.fetchWstEthPrice();
    const wstEthContract = await this.loadCollateralToken();
    const wstEthPerStEth = await wstEthContract.getWstETHByStETH(Decimal.ONE.value);

    return wstEthPrice.mul(new Decimal(wstEthPerStEth, Decimal.PRECISION)).div(Decimal.ONE);
  }

  private async fetchStEthTestnetPrice(): Promise<Decimal> {
    const priceFeed = await this.loadPriceFeed('wstETH');
    const wstEthPrice = new Decimal(await priceFeed.getPrice.staticCall());

    const wstEthContract = await this.loadCollateralToken();
    const wstEthPerStEth = new Decimal(await wstEthContract.getWstETHByStETH(Decimal.ONE.value), Decimal.PRECISION);

    return wstEthPrice.mul(wstEthPerStEth).div(Decimal.ONE);
  }

  private async getTokenRateFromPrice(
    fromToken: UnderlyingCollateralToken,
    toToken: CollateralToken,
  ): Promise<Decimal> {
    const [toTokenPrice, fromTokenPrice] = await Promise.all([this.getPrice(toToken), this.getPrice(fromToken)]);

    return toTokenPrice.div(fromTokenPrice);
  }

  private async getWstEthToStEthRate() {
    const wstEthContract = await this.loadCollateralToken();
    const wstEthPerStEth = await wstEthContract.stEthPerToken();

    return new Decimal(wstEthPerStEth, Decimal.PRECISION);
  }
}
