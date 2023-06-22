import { Provider, ZeroAddress } from 'ethers';
import { RaftConfig } from '../config';
import { ERC20Permit__factory, ERC20__factory } from '../typechain';
import {
  COLLATERAL_TOKENS,
  CollateralToken,
  RToken,
  R_TOKEN,
  Token,
  UNDERLYING_COLLATERAL_TOKENS,
  UnderlyingCollateralToken,
} from '../types';

const UNDERLYING_COLLATERAL_TOKEN_SET = new Set<string>(UNDERLYING_COLLATERAL_TOKENS);
const COLLATERAL_TOKEN_SET = new Set<string>(COLLATERAL_TOKENS);

export function isUnderlyingCollateralToken(token: Token): token is UnderlyingCollateralToken {
  return UNDERLYING_COLLATERAL_TOKEN_SET.has(token);
}

export function isCollateralToken(token: Token): token is CollateralToken {
  return COLLATERAL_TOKEN_SET.has(token);
}

export function isRToken(token: Token): token is RToken {
  return token === R_TOKEN;
}

export function getTokenContract(collateralToken: Token, provider: Provider) {
  const tokenConfig = RaftConfig.networkConfig.tokens[collateralToken];
  const tokenAddress = RaftConfig.getTokenAddress(collateralToken);

  if (tokenAddress === ZeroAddress) {
    return null;
  }

  if (tokenConfig.supportsPermit) {
    return ERC20Permit__factory.connect(tokenAddress, provider);
  }

  return ERC20__factory.connect(tokenAddress, provider);
}
