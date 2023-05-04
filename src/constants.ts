import { Decimal } from 'tempus-decimal';
import { CollateralTokenType, Token } from './types';

export const WSTETH_ADDRESS = '0x6320cD32aA674d2898A68ec82e869385Fc5f7E2f';
export const STETH_ADDRESS = '0x1643E812aE58766192Cf7D2Cf9567dF2C37e9B7F';
export const COLLATERAL_TOKEN_ADDRESSES = {
  [CollateralTokenType.WSTETH]: WSTETH_ADDRESS,
};

export const RAFT_COLLATERAL_TOKEN_WSTETH_ADDRESS = '0x3E579280498709835045c10f981fb0E78F45D086';
export const RAFT_COLLATERAL_TOKEN_ADDRESSES = {
  [CollateralTokenType.WSTETH]: RAFT_COLLATERAL_TOKEN_WSTETH_ADDRESS,
};
export const RAFT_DEBT_TOKEN_ADDRESS = '0x0EcB7264d23c98d8b898d1C0638AF3C56650a12E';

export const POSITION_MANAGER_ADDRESS = '0x0feDed544f10661fA11A85F6bd5381153D04Ea73';

export const MIN_COLLATERAL_RATIO = new Decimal(1.1); // 110%

export const RAFT_TOKEN_ADDRESS = '0x79aE2e90A319CDa33c0fbA7Bf9b15658067C52A9';

// TODO - Use this one everywhere instead of COLLATERAL_TOKEN_ADDRESSES/CollateralTokenType
export const COLLATERAL_TOKEN_ADDRESSES_TICKER_MAP: { [tokenName in Token]: string } = {
  ETH: '', // ETH does not have an address
  R: RAFT_TOKEN_ADDRESS,
  stETH: STETH_ADDRESS,
  wstETH: WSTETH_ADDRESS,
};
