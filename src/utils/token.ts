import { ContractRunner, ZeroAddress } from 'ethers';
import { RaftConfig } from '../config';
import {
  ERC20,
  ERC20Indexable,
  ERC20Indexable__factory,
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
  RaftCollateralToken,
  RaftDebtToken,
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
  'rwstETH-c': ERC20Indexable;
  'rwstETH-d': ERC20Indexable;
  'rwcrETH-c': ERC20Indexable;
  'rwcrETH-d': ERC20Indexable;
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

export function getWrappedCappedCollateralToken(
  underlyingToken: WrappableCappedCollateralToken,
): WrappedCappedUnderlyingCollateralToken {
  return `wc${underlyingToken}`;
}

export function getRaftCollateralToken(token: UnderlyingCollateralToken): RaftCollateralToken {
  return `r${token}-c`;
}

export function getRaftDebtToken(token: UnderlyingCollateralToken): RaftDebtToken {
  return `r${token}-d`;
}

export function isRaftCollateralToken(token: string): token is RaftCollateralToken {
  return token.startsWith('r') && token.endsWith('-c') && token.slice(1, -2) in UNDERLYING_COLLATERAL_TOKEN_SET;
}

export function isRaftDebtToken(token: string): token is RaftDebtToken {
  return token.startsWith('r') && token.endsWith('-d') && token.slice(1, -2) in UNDERLYING_COLLATERAL_TOKEN_SET;
}

export function getUnderlyingCollateralTokenFromRaftToken(
  token: RaftCollateralToken | RaftDebtToken,
): UnderlyingCollateralToken {
  return token.slice(1, -2) as UnderlyingCollateralToken;
}

export function getTokenContract<T extends Token | RaftCollateralToken | RaftDebtToken>(
  token: T,
  runner: ContractRunner,
): TokenContractTypes[T] {
  if (isRaftCollateralToken(token)) {
    const underlyingToken = getUnderlyingCollateralTokenFromRaftToken(token);
    return ERC20Indexable__factory.connect(
      RaftConfig.networkConfig.raftCollateralTokens[underlyingToken],
      runner,
    ) as TokenContractTypes[T];
  }

  if (isRaftDebtToken(token)) {
    const underlyingToken = getUnderlyingCollateralTokenFromRaftToken(token);
    return ERC20Indexable__factory.connect(
      RaftConfig.networkConfig.raftDebtTokens[underlyingToken],
      runner,
    ) as TokenContractTypes[T];
  }

  const tokenConfig = RaftConfig.networkConfig.tokens[token as Token];
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
