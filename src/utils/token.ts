import { ContractRunner } from 'ethers';
import { RaftConfig, SupportedNetwork } from '../config';
import {
  ERC20,
  ERC20Indexable,
  ERC20Indexable__factory,
  ERC20Permit,
  ERC20PermitRToken,
  ERC20PermitRToken__factory,
  ERC20Permit__factory,
  ERC20__factory,
  InterestRateDebtToken__factory,
  RSavingsRate,
  RSavingsRate__factory,
  VotingEscrow,
  VotingEscrow__factory,
  WrappedCollateralToken,
  WrappedCollateralToken__factory,
  WstETH,
  WstETH__factory,
} from '../typechain';
import {
  COLLATERAL_TOKENS,
  CollateralToken,
  InterestRateVault,
  RRToken,
  RR_TOKEN,
  RToken,
  R_TOKEN,
  RaftCollateralToken,
  RaftDebtToken,
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
  veRAFT: VotingEscrow;
  R: ERC20PermitRToken;
  RR: RSavingsRate;
  'B-80RAFT-20R': ERC20Permit;
  'rwstETH-c': ERC20Indexable;
  'rwstETH-d': ERC20Indexable;
  'rwstETH-v1-c': ERC20Indexable;
  'rwstETH-v1-d': ERC20Indexable;
  'rwcrETH-v1-c': ERC20Indexable;
  'rwcrETH-v1-d': ERC20Indexable;
  'rWETH-c': ERC20Indexable;
  'rWETH-d': ERC20Indexable;
  'rrETH-c': ERC20Indexable;
  'rrETH-d': ERC20Indexable;
  'rWBTC-c': ERC20Indexable;
  'rWBTC-d': ERC20Indexable;
  'rcbETH-c': ERC20Indexable;
  'rcbETH-d': ERC20Indexable;
  'rswETH-c': ERC20Indexable;
  'rswETH-d': ERC20Indexable;
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

export function isRRToken(token: Token): token is RRToken {
  return token === RR_TOKEN;
}

export function isVeRaftToken(token: Token): token is 'veRAFT' {
  return token === 'veRAFT';
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
  return token.startsWith('r') && token.endsWith('-c') && UNDERLYING_COLLATERAL_TOKEN_SET.has(token.slice(1, -2));
}

export function isRaftDebtToken(token: string): token is RaftDebtToken {
  return token.startsWith('r') && token.endsWith('-d') && UNDERLYING_COLLATERAL_TOKEN_SET.has(token.slice(1, -2));
}

export function getUnderlyingCollateralTokenFromRaftToken(
  token: RaftCollateralToken | RaftDebtToken,
): UnderlyingCollateralToken {
  return token.slice(1, -2) as UnderlyingCollateralToken;
}

export function getTokenContract<T extends Token | RaftCollateralToken | RaftDebtToken>(
  token: T,
  runner: ContractRunner,
  network: SupportedNetwork = RaftConfig.network,
): TokenContractTypes[T] {
  if (isRaftCollateralToken(token)) {
    const underlyingToken = getUnderlyingCollateralTokenFromRaftToken(token);
    return ERC20Indexable__factory.connect(
      RaftConfig.getNetworkConfig(network).raftCollateralTokens[underlyingToken],
      runner,
    ) as TokenContractTypes[T];
  }

  if (isRaftDebtToken(token)) {
    const underlyingToken = getUnderlyingCollateralTokenFromRaftToken(token);
    return ERC20Indexable__factory.connect(
      RaftConfig.getNetworkConfig(network).raftDebtTokens[underlyingToken],
      runner,
    ) as TokenContractTypes[T];
  }

  const tokenConfig = RaftConfig.getNetworkConfig(network).tokens[token as Token];
  const tokenAddress = RaftConfig.getTokenAddress(token, network);

  if (isVeRaftToken(token)) {
    return VotingEscrow__factory.connect(tokenAddress, runner) as TokenContractTypes[T];
  }

  if (isRToken(token)) {
    return ERC20PermitRToken__factory.connect(tokenAddress, runner) as TokenContractTypes[T];
  }

  if (isRRToken(token)) {
    return RSavingsRate__factory.connect(tokenAddress, runner) as TokenContractTypes[T];
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
