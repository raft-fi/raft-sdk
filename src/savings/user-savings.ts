import { Signer, TransactionResponse } from 'ethers';
import request, { gql } from 'graphql-request';
import { Decimal } from '@tempusfinance/decimal';
import { ERC20PermitSignatureStruct } from '../typechain/RSavingsRate';
import { RR_TOKEN, RToken, R_TOKEN, TransactionWithFeesOptions } from '../types';
import {
  ApproveStep,
  BaseStep,
  BuiltTransactionData,
  EMPTY_PERMIT_SIGNATURE,
  PermitStep,
  buildTransactionWithGasLimit,
  getPermitOrApproveTokenStep,
  getTokenContract,
  isEoaAddress,
} from '../utils';
import { ERC20Permit } from '../typechain';
import { RaftConfig } from '../config';
import { getTokenAllowance } from '../allowance';
import { Savings } from './savings';

export interface ManageSavingsStepType {
  name: 'approve' | 'permit' | 'manageSavings';
}

export interface ManageSavingsOptions extends TransactionWithFeesOptions {
  frontendTag?: string;
  approvalType?: 'permit' | 'approve';
}

type ManageSavingsStep = BaseStep<
  {
    name: 'manageSavings';
  },
  TransactionResponse
>;
export type SavingsStep = ApproveStep<RToken> | PermitStep<RToken> | ManageSavingsStep;

interface ManageSavingsStepsPrefetch {
  rTokenAllowance?: Decimal;
  rPermitSignature?: ERC20PermitSignatureStruct;
}

export type SavingsTransactionType = 'DEPOSIT' | 'WITHDRAW';

interface SavingsTransactionQuery {
  id: string;
  type: SavingsTransactionType;
  amount: string;
  timestamp: string;
}

interface SavingsTransactionsQuery {
  position: {
    savings: SavingsTransactionQuery[];
  } | null;
}

export interface SavingsTransaction {
  id: string;
  type: SavingsTransactionType;
  amount: Decimal;
  timestamp: Date;
}

export class UserSavings extends Savings {
  private user: Signer;
  private rToken: ERC20Permit;

  constructor(user: Signer) {
    super(user);

    this.user = user;
    this.rToken = getTokenContract(R_TOKEN, this.user);
  }

  public async *getManageSavingsSteps(
    amount: Decimal,
    options: ManageSavingsOptions & ManageSavingsStepsPrefetch = {},
  ): AsyncGenerator<SavingsStep, void, ERC20PermitSignatureStruct | undefined> {
    const {
      gasLimitMultiplier = Decimal.ONE,
      rPermitSignature: cachedRPermitSignature,
      frontendTag,
      approvalType = 'permit',
    } = options;

    let { rTokenAllowance } = options;

    const isEoaSavingsOwner = await isEoaAddress(this.user, this.user);
    const isSavingsIncrease = amount.gt(Decimal.ZERO);
    const rTokenAllowanceRequired = isSavingsIncrease;
    const canUsePermit = isEoaSavingsOwner && approvalType === 'permit';

    // In case the R token allowance check is not passed externally, check the allowance
    if (rTokenAllowance === undefined) {
      rTokenAllowance = rTokenAllowanceRequired
        ? await getTokenAllowance(R_TOKEN, this.rToken, this.user, RaftConfig.getTokenAddress(RR_TOKEN))
        : Decimal.MAX_DECIMAL;
    }

    const rTokenApprovalStepNeeded =
      rTokenAllowanceRequired && amount.gt(rTokenAllowance) && (!canUsePermit || !cachedRPermitSignature);

    const numberOfSteps = Number(rTokenApprovalStepNeeded) + 1;
    let stepCounter = 1;

    let rPermitSignature = EMPTY_PERMIT_SIGNATURE;
    if (rTokenApprovalStepNeeded) {
      rPermitSignature = yield* getPermitOrApproveTokenStep(
        this.user,
        R_TOKEN,
        this.rToken,
        amount,
        RaftConfig.getTokenAddress(RR_TOKEN),
        stepCounter++,
        numberOfSteps,
        canUsePermit,
        cachedRPermitSignature,
      );
    }

    const absAmountValue = amount.abs().toBigInt(RaftConfig.networkConfig.tokens.R.decimals);
    let builtTransactionData: BuiltTransactionData;

    // If amount is greater then zero, user wants to deposit, otherwise call withdraw
    if (isSavingsIncrease) {
      if (canUsePermit) {
        builtTransactionData = await buildTransactionWithGasLimit(
          this.rSavingsRateContract.depositWithPermit,
          [absAmountValue, this.user, rPermitSignature],
          gasLimitMultiplier,
          frontendTag,
          this.user,
        );
      } else {
        builtTransactionData = await buildTransactionWithGasLimit(
          this.rSavingsRateContract.deposit,
          [absAmountValue, this.user],
          gasLimitMultiplier,
          frontendTag,
          this.user,
        );
      }
    } else {
      builtTransactionData = await buildTransactionWithGasLimit(
        this.rSavingsRateContract.withdraw,
        [absAmountValue, this.user, this.user],
        gasLimitMultiplier,
        frontendTag,
        this.user,
      );
    }

    const { sendTransaction: action, gasEstimate } = builtTransactionData;

    yield {
      type: {
        name: 'manageSavings',
      },
      stepNumber: stepCounter++,
      numberOfSteps,
      gasEstimate,
      action,
    };
  }

  /**
   * Returns the address of the owner of the savings position.
   * @returns The address of the owner.
   */
  public async getUserAddress(): Promise<string> {
    return this.user.getAddress();
  }

  public async currentSavings(): Promise<Decimal> {
    const userSavings = await this.rSavingsRateContract.maxWithdraw(this.user);

    return new Decimal(userSavings, RaftConfig.networkConfig.tokens.R.decimals);
  }

  async getSavingsTransactions(): Promise<SavingsTransaction[]> {
    const query = gql`
      query GetTransactions($ownerAddress: String!) {
        position(id: $ownerAddress) {
          savings(orderBy: timestamp, orderDirection: desc) {
            id
            type
            amount
            timestamp
          }
        }
      }
    `;

    const userAddress = await this.getUserAddress();
    const response = await request<SavingsTransactionsQuery>(RaftConfig.subgraphEndpoint, query, {
      ownerAddress: userAddress.toLowerCase(),
    });

    if (!response.position?.savings) {
      return [];
    }

    return response.position.savings.map(savingsTransaction => ({
      ...savingsTransaction,
      amount: Decimal.parse(BigInt(savingsTransaction.amount), 0n, Decimal.PRECISION),
      timestamp: new Date(Number(savingsTransaction.timestamp) * 1000),
    }));
  }
}
