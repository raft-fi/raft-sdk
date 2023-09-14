import { Decimal } from '@tempusfinance/decimal';
import { Signer, TransactionResponse } from 'ethers';
import { ERC20, ERC20Permit } from '../typechain';
import { Token } from '../types';
import { ERC20PermitSignatureStruct, PositionManager } from '../typechain/PositionManager';
import { createPermitSignature, EMPTY_PERMIT_SIGNATURE, sendTransactionWithGasLimit } from '../utils';
import { RaftConfig } from '../config';

export type BaseStep = {
  stepNumber: number;
  numberOfSteps: number;
};

type WhitelistStep = {
  type: {
    name: 'whitelist';
  };
  action: () => Promise<TransactionResponse>;
} & BaseStep;

type PermitStep<T extends Token> = {
  type: {
    name: 'permit';
    token: T;
  };
  action: () => Promise<ERC20PermitSignatureStruct>;
} & BaseStep;

type ApproveStep<T extends Token> = {
  type: {
    name: 'approve';
    token: T;
  };
  action: () => Promise<TransactionResponse>;
} & BaseStep;

export async function* getWhitelistStep(
  positionManager: PositionManager,
  delegatorAddress: string,
  stepNumber: number,
  numberOfSteps: number,
): AsyncGenerator<WhitelistStep, void, unknown> {
  yield {
    type: {
      name: 'whitelist',
    },
    stepNumber,
    numberOfSteps,
    action: () => sendTransactionWithGasLimit(positionManager.whitelistDelegate, [delegatorAddress, true]),
  };
}

export function* getSignTokenPermitStep<T extends Token>(
  signer: Signer,
  token: T,
  tokenContract: ERC20Permit,
  approveAmount: Decimal,
  spenderAddress: string,
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
      action: () => createPermitSignature(signer, approveAmount, spenderAddress, tokenContract),
    });

  if (!signature) {
    throw new Error(`${token} permit signature is required`);
  }

  return signature;
}

export async function* getApproveTokenStep<T extends Token>(
  token: T,
  tokenContract: ERC20 | ERC20Permit,
  approveAmount: Decimal,
  spenderAddress: string,
  stepNumber: number,
  numberOfSteps: number,
): AsyncGenerator<ApproveStep<T>, void, unknown> {
  const tokenDecimals = RaftConfig.networkConfig.tokens[token].decimals;

  yield {
    type: {
      name: 'approve' as const,
      token: token,
    },
    stepNumber,
    numberOfSteps,
    action: () =>
      sendTransactionWithGasLimit(tokenContract.approve, [spenderAddress, approveAmount.toBigInt(tokenDecimals)]),
  };
}

export async function* getPermitOrApproveTokenStep<T extends Token>(
  signer: Signer,
  token: T,
  tokenContract: ERC20 | ERC20Permit,
  approveAmount: Decimal,
  spenderAddress: string,
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
      tokenContract,
      approveAmount,
      spenderAddress,
      stepNumber,
      numberOfSteps,
      cachedPermitSignature,
    );
  } else {
    yield* getApproveTokenStep(token, tokenContract, approveAmount, spenderAddress, stepNumber, numberOfSteps);
  }

  return permitSignature;
}
