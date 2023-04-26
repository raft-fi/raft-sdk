import { Contract, ContractRunner } from 'ethers';
import erc20Indexable from '../abi/ERC20Indexable.json';
import { RAFT_COLLATERAL_TOKEN_ADDRESSES } from '../constants';
import { CollateralTokenType } from '../types';

export class RaftCollateralToken extends Contract {
  constructor(collateralToken: CollateralTokenType, runner?: null | ContractRunner) {
    super(RAFT_COLLATERAL_TOKEN_ADDRESSES[collateralToken], erc20Indexable, runner);
  }
}
