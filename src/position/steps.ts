import { Decimal } from '@tempusfinance/decimal';
import { Signer, TransactionResponse } from 'ethers';
import { ERC20, ERC20Permit } from '../typechain';
import { Token } from '../types';
import { ERC20PermitSignatureStruct, PositionManager } from '../typechain/PositionManager';
import { buildTransactionWithGasLimit, createEmptyPermitSignature, createPermitSignature } from '../utils';

export type BaseStep = {
  stepNumber: number;
  numberOfSteps: number;
  gasEstimate: Decimal;
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
  getStepNumber: () => number,
  numberOfSteps: number,
): AsyncGenerator<WhitelistStep, void, unknown> {
  const { sendTransaction, gasEstimate } = await buildTransactionWithGasLimit(positionManager.whitelistDelegate, [
    delegatorAddress,
    true,
  ]);

  yield {
    type: {
      name: 'whitelist',
    },
    stepNumber: getStepNumber(),
    numberOfSteps,
    action: sendTransaction,
    gasEstimate,
  };
}

export function* getSignTokenPermitStep<T extends Token>(
  signer: Signer,
  token: T,
  tokenContract: ERC20Permit,
  approveAmount: Decimal,
  spenderAddress: string,
  getStepNumber: () => number,
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
      stepNumber: getStepNumber(),
      numberOfSteps,
      action: () => createPermitSignature(signer, approveAmount, spenderAddress, tokenContract),
      gasEstimate: Decimal.ZERO,
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
  getStepNumber: () => number,
  numberOfSteps: number,
): AsyncGenerator<ApproveStep<T>, void, unknown> {
  const { sendTransaction, gasEstimate } = await buildTransactionWithGasLimit(tokenContract.approve, [
    spenderAddress,
    approveAmount.toBigInt(Decimal.PRECISION),
  ]);

  yield {
    type: {
      name: 'approve' as const,
      token: token,
    },
    stepNumber: getStepNumber(),
    numberOfSteps,
    action: sendTransaction,
    gasEstimate,
  };
}

export async function* getPermitOrApproveTokenStep<T extends Token>(
  signer: Signer,
  token: T,
  tokenContract: ERC20 | ERC20Permit,
  approveAmount: Decimal,
  spenderAddress: string,
  getStepNumber: () => number,
  numberOfSteps: number,
  canUsePermit: boolean,
  cachedPermitSignature?: ERC20PermitSignatureStruct,
): AsyncGenerator<PermitStep<T> | ApproveStep<T>, ERC20PermitSignatureStruct, ERC20PermitSignatureStruct | undefined> {
  let permitSignature = createEmptyPermitSignature();

  if (canUsePermit) {
    permitSignature = yield* getSignTokenPermitStep(
      signer,
      token,
      tokenContract,
      approveAmount,
      spenderAddress,
      getStepNumber,
      numberOfSteps,
      cachedPermitSignature,
    );
  } else {
    yield* getApproveTokenStep(token, tokenContract, approveAmount, spenderAddress, getStepNumber, numberOfSteps);
  }

  return permitSignature;
}
