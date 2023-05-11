import { Decimal } from '@tempusfinance/decimal';
import { Token, UnderlyingCollateralToken } from './types';

// Token addresses

export const WSTETH_ADDRESS = '0x6320cD32aA674d2898A68ec82e869385Fc5f7E2f';
export const STETH_ADDRESS = '0x1643E812aE58766192Cf7D2Cf9567dF2C37e9B7F';

export const RAFT_COLLATERAL_TOKEN_WSTETH_ADDRESS = '0xEff7d350DDF490CB3b12A96Adc476F0ee5908efE';
export const RAFT_COLLATERAL_TOKEN_ADDRESSES: { [tokenTicker in UnderlyingCollateralToken]: string } = {
  wstETH: RAFT_COLLATERAL_TOKEN_WSTETH_ADDRESS,
};
export const RAFT_DEBT_TOKEN_ADDRESS = '0x8f616D781e799fE8e150AE98F3e233722007e536';

export const POSITION_MANAGER_ADDRESS = '0xfFaAB9cb73844DE549d28B4fFe348f48eff267C9';
export const POSITION_MANAGER_STETH_ADDRESS = '0x82d1A80499BE14E73086f07659223aCD04697746';

export const R_TOKEN_ADDRESS = '0x69665394a7ee38bb4599B0D7EBC9802242e2bF87';

export const TOKEN_TICKER_ADDRESSES_MAP: { [tokenTicker in Token]: string } = {
  ETH: '', // ETH does not have an address
  R: R_TOKEN_ADDRESS,
  stETH: STETH_ADDRESS,
  wstETH: WSTETH_ADDRESS,
};

// Protocol constants

export const MIN_COLLATERAL_RATIO = new Decimal(1.1); // 110%
export const MIN_NET_DEBT = new Decimal(3000); // 3000 R

export const PERMIT_DEADLINE_SHIFT = 30 * 60; // 30 minutes

export const TOKENS_WITH_PERMIT = ['wstETH'];

export const GAS_LIMIT_MULTIPLIER = new Decimal(1.2); // 20%
