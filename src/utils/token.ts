import { ContractRunner } from 'ethers';
import { RaftConfig } from '../config';
import {
  ERC20,
  ERC20Permit,
  ERC20PermitRToken,
  ERC20PermitRToken__factory,
  ERC20Permit__factory,
  ERC20__factory,
  InterestRateDebtToken__factory,
  WrappedCollateralToken,
  WrappedCollateralToken__factory,
  WstETH,
  WstETH__factory,
} from '../typechain';
import {
  COLLATERAL_TOKENS,
  CollateralToken,
  InterestRateVault,
  RToken,
  R_TOKEN,
  Token,
  UNDERLYING_COLLATERAL_TOKENS,
  UnderlyingCollateralToken,
  VAULTS_V1,
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
  stETH: ERC20;
  wstETH: WstETH;
  'wstETH-v1': WstETH;
  rETH: ERC20;
  'rETH-v1': ERC20;
  WETH: ERC20;
  'wcrETH-v1': WrappedCollateralToken;
  WBTC: ERC20;
  cbETH: ERC20;
  swETH: ERC20;
  RAFT: ERC20Permit;
  R: ERC20PermitRToken;
  'B-80RAFT-20R': ERC20Permit;
};

export function isInterestRateVault(
  underlyingCollateralToken: UnderlyingCollateralToken,
): underlyingCollateralToken is InterestRateVault {
  return !VAULTS_V1.includes(underlyingCollateralToken as never);
}

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

  if (isRToken(token)) {
    return ERC20PermitRToken__factory.connect(tokenAddress, runner) as TokenContractTypes[T];
  }

  if (token === 'wstETH' || token === 'wstETH-v1') {
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

export function getInterestRateDebtTokenContract(debtToken: string, runner: ContractRunner) {
  return InterestRateDebtToken__factory.connect(debtToken, runner);
}
