import { ContractRunner, ZeroAddress } from 'ethers';
import { RaftConfig } from '../config';
import {
  ERC20,
  ERC20PermitRToken,
  ERC20PermitRToken__factory,
  ERC20Permit__factory,
  ERC20__factory,
  WrappedCollateralToken,
  WrappedCollateralToken__factory,
  WstETH,
  WstETH__factory,
} from '../typechain';
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
  wstETH: WstETH;
  rETH: ERC20;
  wcrETH: WrappedCollateralToken;
  R: ERC20PermitRToken;
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

export function getTokenContract<T extends Token>(token: T, runner: ContractRunner): TokenContractTypes[T] {
  const tokenConfig = RaftConfig.networkConfig.tokens[token];
  const tokenAddress = RaftConfig.getTokenAddress(token);

  if (tokenAddress === ZeroAddress) {
    return null as TokenContractTypes[T];
  }

  if (isRToken(token)) {
    return ERC20PermitRToken__factory.connect(tokenAddress, runner) as TokenContractTypes[T];
  }

  if (token === 'wstETH') {
    return WstETH__factory.connect(tokenAddress, runner) as TokenContractTypes[T];
  }

  if (isWrappedCappedUnderlyingCollateralToken(token)) {
    return WrappedCollateralToken__factory.connect(tokenAddress, runner) as TokenContractTypes[T];
  }

  if (tokenConfig.supportsPermit) {
    return ERC20Permit__factory.connect(tokenAddress, runner) as TokenContractTypes[T];
  }

  return ERC20__factory.connect(tokenAddress, runner) as TokenContractTypes[T];
}
