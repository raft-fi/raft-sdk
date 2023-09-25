import { getRRToRRate } from '../price';
import { RRToken } from '../types';
import { NetworkConfig, TokenConfig } from './types';

const tokensConfig: Record<RRToken, TokenConfig> = {
  RR: {
    address: '0x0000000000000000000000000000000000000000', // TODO: add address
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
