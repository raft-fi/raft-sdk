import { Decimal } from '@tempusfinance/decimal';
import { getRRToRRate } from '../price';
import { RRToken, RToken } from '../types';
import { NetworkConfig, TokenConfig } from './types';

const tokensConfig: Record<RRToken | RToken, TokenConfig> = {
  R: {
    address: '0xafb2820316e7bc5ef78d295ab9b8bb2257534576',
    ticker: 'R',
    decimals: 18,
    supportsPermit: true,
    priceFeed: Decimal.ONE,
  },
  RR: {
    address: '0xa5b3fee253f9de67201dc8572bd2cbb4a81c1bec',
    ticker: 'RR',
    decimals: 18,
    supportsPermit: false,
    priceFeed: {
      fallbackToken: 'R',
      getFallbackRate: getRRToRRate,
    },
  },
};

export const baseConfig = {
  tokens: tokensConfig,
} as NetworkConfig; // TODO: use a more specific type here
