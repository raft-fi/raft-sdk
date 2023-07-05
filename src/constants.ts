import { Decimal } from '@tempusfinance/decimal';
import { UnderlyingCollateralToken } from './types';

// Protocol constants

export const MIN_COLLATERAL_RATIO: Record<UnderlyingCollateralToken, Decimal> = {
  wstETH: new Decimal(1.2), // 120%
  wcrETH: new Decimal(1.2), // 120%
};
export const MIN_NET_DEBT = new Decimal(3000); // 3000 R
export const SUBGRAPH_PRICE_PRECISION = 8;
