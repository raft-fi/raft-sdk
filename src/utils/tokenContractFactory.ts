import { Provider } from 'ethers';
import { RaftConfig } from '../config';
import { ERC20Permit__factory, ERC20__factory } from '../typechain';
import { Token } from '../types';

export function getTokenContract(collateralToken: Token, provider: Provider) {
  const tokenConfig = RaftConfig.networkConfig.tokens[collateralToken];

  if (tokenConfig.ticker === 'ETH') {
    return null;
  }

  if (tokenConfig.supportsPermit) {
    return ERC20Permit__factory.connect(RaftConfig.getTokenAddress(collateralToken), provider);
  }

  return ERC20__factory.connect(RaftConfig.getTokenAddress(collateralToken), provider);
}
