import { Decimal } from '@tempusfinance/decimal';
import { SwapRouter, UnderlyingCollateralToken } from './types';

// Protocol constants

export const MIN_COLLATERAL_RATIO: Record<UnderlyingCollateralToken, Decimal> = {
  wstETH: new Decimal(1.2), // 120%
  wcrETH: new Decimal(1.2), // 120%
};
export const MIN_NET_DEBT = new Decimal(3000); // 3000 R
export const SUBGRAPH_PRICE_PRECISION = 8;
export const BALANCER_R_DAI_POOL_ID = '0x20a61b948e33879ce7f23e535cc7baa3bc66c5a9000000000000000000000555';
export const DAI_TOKEN_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

export const SWAP_ROUTER_MAX_SLIPPAGE: Record<SwapRouter, Decimal> = {
  '1inch': new Decimal(0.5),
};
