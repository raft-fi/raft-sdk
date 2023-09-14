import { Decimal } from '@tempusfinance/decimal';
import { SwapRouter, UnderlyingCollateralToken } from './types';

// Time constants

export const SECONDS_IN_MINUTE = 60;
export const SECONDS_PER_YEAR = 60 * 60 * 24 * 365.2425; // One Gregorian year has 365.2425 days

// Protocol constants

export const MIN_COLLATERAL_RATIO: Record<UnderlyingCollateralToken, Decimal> = {
  'wstETH-v1': new Decimal(1.2), // 120%
  'wcrETH-v1': new Decimal(1.2), // 120%
  wstETH: new Decimal(1.2), // 120%
  WETH: new Decimal(1.2), // 120%
  rETH: new Decimal(1.2), // 120%
  WBTC: new Decimal(1.2), // 120%
  cbETH: new Decimal(1.3), // 130%
  swETH: new Decimal(1.5), // 150%
};
export const MIN_NET_DEBT = new Decimal(3000); // 3000 R
export const FLASH_MINT_FEE = new Decimal(0.0001); // default flash mint fee
export const SUBGRAPH_PRICE_PRECISION = 8;
export const BALANCER_R_DAI_POOL_ID = '0x20a61b948e33879ce7f23e535cc7baa3bc66c5a9000000000000000000000555';
export const DAI_TOKEN_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
export const CHAI_TOKEN_ADDRESS = '0x06af07097c9eeb7fd685c692751d5c66db49c215';
export const R_CHAI_PSM_ADDRESS = '0xa03342feb2e1d4690b60ef556509ec3b76c97ee7';
export const CHAI_RATE_PRECISION = 27;
export const CHAI_PRECISION = 18;
export const BORROWING_RATE_PRECISION = 18;
export const INDEX_INCREASE_PRECISION = 18;
export const ETH_PRECISION = 18;
export const STETH_RATE_PRECISION = 18;
export const RR_PRECISION = 18;
export const RAFT_DEBT_TOKEN_PRECISION = 18;
export const RAFT_COLLATERAL_TOKEN_PRECISION = 18;
export const MAX_FEE_PERCENTAGE_PRECISION = 18;
export const CHAINLINK_DAI_USD_AGGREGATOR = '0xaed0c38402a5d19df6e4c03f4e2dced6e29c1ee9';

export const SWAP_ROUTER_MAX_SLIPPAGE: Record<SwapRouter, Decimal> = {
  '1inch': new Decimal(0.5),
};
