import { Provider, ZeroAddress } from 'ethers';
import { RaftConfig } from '../config';
import { ERC20, ERC20Permit, ERC20Permit__factory, ERC20__factory } from '../typechain';
import {
  COLLATERAL_TOKENS,
  CollateralToken,
  RToken,
  R_TOKEN,
  Token,
  UNDERLYING_COLLATERAL_TOKENS,
  UnderlyingCollateralToken,
  WRAPPABLE_CAPPED_COLLATERAL_TOKENS,
  WRAPPED_CAPPED_UNDERLYING_COLLATERAL_TOKENS,
  WrappableCappedCollateralToken,
  WrappedCappedUnderlyingCollateralToken,
} from '../types';

const WRAPPABLE_CAPPED_COLLATERAL_TOKEN_SET = new Set<string>(WRAPPABLE_CAPPED_COLLATERAL_TOKENS);
const WRAPPED_CAPPED_UNDERLYING_COLLATERAL_TOKEN_SET = new Set<string>(WRAPPED_CAPPED_UNDERLYING_COLLATERAL_TOKENS);
const UNDERLYING_COLLATERAL_TOKEN_SET = new Set<string>(UNDERLYING_COLLATERAL_TOKENS);
const COLLATERAL_TOKEN_SET = new Set<string>(COLLATERAL_TOKENS);

type TokenContractTypes = {
  ETH: null;
  stETH: ERC20;
  wstETH: ERC20Permit;
  rETH: ERC20;
  wcrETH: ERC20Permit;
  R: ERC20Permit;
};

export function isWrappableCappedCollateralToken(token: Token): token is WrappableCappedCollateralToken {
  return WRAPPABLE_CAPPED_COLLATERAL_TOKEN_SET.has(token);
}

export function isWrappedCappedUnderlyingCollateralToken(
  token: Token,
): token is WrappedCappedUnderlyingCollateralToken {
  return WRAPPED_CAPPED_UNDERLYING_COLLATERAL_TOKEN_SET.has(token);
}

export function isUnderlyingCollateralToken(token: Token): token is UnderlyingCollateralToken {
  return UNDERLYING_COLLATERAL_TOKEN_SET.has(token);
}

export function isCollateralToken(token: Token): token is CollateralToken {
  return COLLATERAL_TOKEN_SET.has(token);
}

export function isRToken(token: Token): token is RToken {
  return token === R_TOKEN;
}

export function getWrappedCappedCollateralToken<T extends WrappableCappedCollateralToken>(
  underlyingToken: T,
): WrappedCappedUnderlyingCollateralToken {
  return `wc${underlyingToken}`;
}

export function getTokenContract<T extends Token>(collateralToken: T, provider: Provider): TokenContractTypes[T] {
  const tokenConfig = RaftConfig.networkConfig.tokens[collateralToken];
  const tokenAddress = RaftConfig.getTokenAddress(collateralToken);

  if (tokenAddress === ZeroAddress) {
    return null as TokenContractTypes[T];
  }

  if (tokenConfig.supportsPermit) {
    return ERC20Permit__factory.connect(tokenAddress, provider) as TokenContractTypes[T];
  }

  return ERC20__factory.connect(tokenAddress, provider) as TokenContractTypes[T];
}
