import { Decimal } from '@tempusfinance/decimal';
import { Contract, JsonRpcSigner, Provider } from 'ethers';
import { RaftConfig } from '../config';
import { PositionManager, PositionManager__factory, WstETH, WstETH__factory } from '../typechain';
import { R_TOKEN, Token, UnderlyingCollateralToken } from '../types';

export class PriceFeed {
  private provider: Provider;
  private signer: JsonRpcSigner | null = null;
  private positionManager: PositionManager;
  private priceFeeds = new Map<UnderlyingCollateralToken, Contract>();
  private setPriceFeeds = new Map<UnderlyingCollateralToken, Contract>();
  private collateralTokens = new Map<UnderlyingCollateralToken, WstETH>();

  public constructor(provider: Provider, signer?: JsonRpcSigner) {
    this.provider = provider;
    this.signer = signer || null;
    this.positionManager = PositionManager__factory.connect(RaftConfig.addresses.positionManager, provider);
  }

  public async getPrice(token: Token): Promise<Decimal> {
    switch (token) {
      case R_TOKEN:
        return Decimal.ONE;

      case 'ETH':
      case 'stETH': {
        const priceFeed = await this.loadPriceFeed('wstETH');
        const wstEthPrice = new Decimal(await priceFeed.getPrice());

        const wstEthContract = await this.loadCollateralToken();
        const wstEthPerStEth = new Decimal(await wstEthContract.getWstETHByStETH(Decimal.ONE.value), Decimal.PRECISION);

        return wstEthPrice.mul(wstEthPerStEth).div(Decimal.ONE);
      }

      case 'wstETH': {
        const priceFeed = await this.loadPriceFeed('wstETH');
        return new Decimal(await priceFeed.getPrice());
      }
    }
  }

  public async setPrice(price: Decimal): Promise<void> {
    const feed = await this.loadSetPriceFeed('wstETH');

    await feed.setPrice(price.toBigInt(Decimal.PRECISION));
  }

  private async loadPriceFeed(token: UnderlyingCollateralToken): Promise<Contract> {
    if (!this.priceFeeds.has(token)) {
      const priceFeedAddress = await this.positionManager.priceFeeds(RaftConfig.getTokenAddress(token) as string);
      const contract = new Contract(priceFeedAddress, ['function getPrice() view returns (uint256)'], this.provider);

      this.priceFeeds.set(token, contract);
      return contract;
    }

    return this.priceFeeds.get(token) as Contract;
  }

  private async loadSetPriceFeed(token: UnderlyingCollateralToken): Promise<Contract> {
    if (!this.setPriceFeeds.has(token)) {
      const priceFeedAddress = await this.positionManager.priceFeeds(RaftConfig.getTokenAddress(token) as string);
      const contract = new Contract(
        priceFeedAddress,
        ['function setPrice(uint256 price) external returns (bool)'],
        this.signer,
      );

      this.setPriceFeeds.set(token, contract);
      return contract;
    }

    return this.setPriceFeeds.get(token) as Contract;
  }

  private async loadCollateralToken(): Promise<WstETH> {
    if (!this.collateralTokens.has('wstETH')) {
      const contract = WstETH__factory.connect(RaftConfig.addresses.wstEth, this.provider);

      this.collateralTokens.set('wstETH', contract);
      return contract;
    }

    return this.collateralTokens.get('wstETH') as WstETH;
  }
}
