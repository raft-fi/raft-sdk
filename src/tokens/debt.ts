import { Contract, ContractRunner } from 'ethers';
import erc20Indexable from '../abi/ERC20Indexable.json';
import { RAFT_DEBT_TOKEN_ADDRESS } from '../constants';

export class RaftDebtToken extends Contract {
  constructor(runner?: null | ContractRunner) {
    super(RAFT_DEBT_TOKEN_ADDRESS, erc20Indexable, runner);
  }
}
