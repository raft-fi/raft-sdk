import Decimal from '@tempusfinance/decimal';
import { CollateralTokenType } from './types';

export const WSTETH_ADDRESS = '0x6320cD32aA674d2898A68ec82e869385Fc5f7E2f';

export const RAFT_COLLATERAL_TOKEN_WSTETH_ADDRESS = '0x3E579280498709835045c10f981fb0E78F45D086';
export const RAFT_COLLATERAL_TOKEN_ADDRESSES = {
  [CollateralTokenType.WSTETH]: RAFT_COLLATERAL_TOKEN_WSTETH_ADDRESS,
};
export const RAFT_DEBT_TOKEN_ADDRESS = '0x0EcB7264d23c98d8b898d1C0638AF3C56650a12E';

export const MIN_COLLATERAL_RATIO = new Decimal(1.1); // 110%
