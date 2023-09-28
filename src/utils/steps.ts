import { Decimal } from '@tempusfinance/decimal';
import { AddressLike, Signer, TransactionResponse } from 'ethers';
import { Token, Erc20TokenContract, Erc20PermitTokenContract } from '../types';
import { ERC20PermitSignatureStruct, PositionManager } from '../typechain/PositionManager';
import { RaftConfig } from '../config';
import { EMPTY_PERMIT_SIGNATURE, createPermitSignature } from './permit';
import { buildTransactionWithGasLimit } from './transactions';

export type BaseStep<T, A extends TransactionResponse | ERC20PermitSignatureStruct> = {
  type: T;
  stepNumber: number;
  numberOfSteps: number;
  gasEstimate: Decimal;
  action: () => Promise<A>;
};

export type WhitelistStep = BaseStep<
  {
    name: 'whitelist';
  },
  TransactionResponse
>;

export type PermitStep<T extends Token> = BaseStep<
  {
    name: 'permit';
    token: T;
  },
  ERC20PermitSignatureStruct
>;

export type ApproveStep<T extends Token> = BaseStep<
  {
    name: 'approve';
    token: T;
  },
  TransactionResponse
>;

export async function* getWhitelistStep(
  positionManager: PositionManager,
  delegatorAddress: string,
  stepNumber: number,
  numberOfSteps: number,
  signer: Signer,
): AsyncGenerator<WhitelistStep, void, unknown> {
  const { sendTransaction, gasEstimate } = await buildTransactionWithGasLimit(
    positionManager.whitelistDelegate,
    [delegatorAddress, true],
    signer,
  );

  yield {
    type: {
      name: 'whitelist',
    },
    stepNumber,
    numberOfSteps,
    gasEstimate,
    action: sendTransaction,
  };
}

export function* getSignTokenPermitStep<T extends Token>(
  signer: Signer,
  token: T,
  tokenContract: Erc20PermitTokenContract,
  approveAmount: Decimal,
  spender: AddressLike,
  stepNumber: number,
  numberOfSteps: number,
  cachedSignature?: ERC20PermitSignatureStruct,
): Generator<PermitStep<T>, ERC20PermitSignatureStruct, ERC20PermitSignatureStruct | undefined> {
  const signature =
    cachedSignature ??
    (yield {
      type: {
        name: 'permit' as const,
        token: token,
      },
      stepNumber,
      numberOfSteps,
      gasEstimate: Decimal.ZERO,
      action: () => createPermitSignature(token, signer, approveAmount, spender, tokenContract),
    });

  if (!signature) {
    throw new Error(`${token} permit signature is required`);
  }

  return signature;
}

export async function* getApproveTokenStep<T extends Token>(
  token: T,
  tokenContract: Erc20TokenContract,
  approveAmount: Decimal,
  spender: AddressLike,
  stepNumber: number,
  numberOfSteps: number,
  signer: Signer,
): AsyncGenerator<ApproveStep<T>, void, unknown> {
  const tokenDecimals = RaftConfig.networkConfig.tokens[token].decimals;
  const { sendTransaction, gasEstimate } = await buildTransactionWithGasLimit(
    tokenContract.approve,
    [spender, approveAmount.toBigInt(tokenDecimals)],
    signer,
  );

  yield {
    type: {
      name: 'approve' as const,
      token: token,
    },
    stepNumber,
    numberOfSteps,
    gasEstimate,
    action: sendTransaction,
  };
}

export async function* getPermitOrApproveTokenStep<T extends Token>(
  signer: Signer,
  token: T,
  tokenContract: Erc20TokenContract,
  approveAmount: Decimal,
  spender: AddressLike,
  stepNumber: number,
  numberOfSteps: number,
  canUsePermit: boolean,
  cachedPermitSignature?: ERC20PermitSignatureStruct,
): AsyncGenerator<PermitStep<T> | ApproveStep<T>, ERC20PermitSignatureStruct, ERC20PermitSignatureStruct | undefined> {
  let permitSignature = EMPTY_PERMIT_SIGNATURE;

  if (canUsePermit) {
    permitSignature = yield* getSignTokenPermitStep(
      signer,
      token,
      tokenContract as Erc20PermitTokenContract,
      approveAmount,
      spender,
      stepNumber,
      numberOfSteps,
      cachedPermitSignature,
    );
  } else {
    yield* getApproveTokenStep(token, tokenContract, approveAmount, spender, stepNumber, numberOfSteps, signer);
  }

  return permitSignature;
}
