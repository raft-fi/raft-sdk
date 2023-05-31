import { Decimal } from '@tempusfinance/decimal';
import { Contract, Provider } from 'ethers';
import { RaftConfig } from '../config';
import { PositionManager, PositionManager__factory, WstETH, WstETH__factory } from '../typechain';
import { R_TOKEN, Token, UnderlyingCollateralToken } from '../types';

export class PriceFeed {
  private provider: Provider;
  private positionManager: PositionManager;
  private priceFeeds = new Map<UnderlyingCollateralToken, Contract>();
  private collateralTokens = new Map<UnderlyingCollateralToken, WstETH>();

  public constructor(provider: Provider) {
    this.provider = provider;
    this.positionManager = PositionManager__factory.connect(RaftConfig.networkConfig.positionManager, provider);
  }

  public async getPrice(token: Token): Promise<Decimal> {
    switch (token) {
      case R_TOKEN:
        return Decimal.ONE;

      case 'ETH':
      case 'stETH': {
        const priceFeed = await this.loadPriceFeed('wstETH');
        let wstEthPrice: Decimal;
        if (RaftConfig.isTestNetwork) {
          wstEthPrice = new Decimal(await priceFeed.getPrice());
        } else {
          wstEthPrice = new Decimal(await priceFeed.lastGoodPrice());
        }

        const wstEthContract = await this.loadCollateralToken();
        const wstEthPerStEth = new Decimal(await wstEthContract.getWstETHByStETH(Decimal.ONE.value), Decimal.PRECISION);

        return wstEthPrice.mul(wstEthPerStEth).div(Decimal.ONE);
      }

      case 'wstETH': {
        const priceFeed = await this.loadPriceFeed('wstETH');
        if (RaftConfig.isTestNetwork) {
          return new Decimal(await priceFeed.getPrice());
        } else {
          return new Decimal(await priceFeed.lastGoodPrice());
        }
      }
    }
  }

  private async loadPriceFeed(token: UnderlyingCollateralToken): Promise<Contract> {
    if (!this.priceFeeds.has(token)) {
      const priceFeedAddress = await this.positionManager.priceFeed(RaftConfig.getTokenAddress(token) as string);
      const contract = new Contract(
        priceFeedAddress,
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
      const contract = WstETH__factory.connect(RaftConfig.networkConfig.wstEth, this.provider);

      this.collateralTokens.set('wstETH', contract);
      return contract;
    }

    return this.collateralTokens.get('wstETH') as WstETH;
  }
}
