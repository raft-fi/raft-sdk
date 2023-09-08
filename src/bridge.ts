import { Decimal } from '@tempusfinance/decimal';
import {
  AbiCoder,
  ContractTransactionResponse,
  JsonRpcProvider,
  Signer,
  TransactionReceipt,
  TransactionResponse,
  ZeroAddress,
  ethers,
} from 'ethers';
import { CCIPOffRamp__factory, CCIPRouter__factory, ERC20__factory } from './typechain';
import { TransactionWithFeesOptions } from './types';
import { sendTransactionWithGasLimit } from './utils';

export interface BridgeTokensOptions extends TransactionWithFeesOptions {
  frontendTag?: string;
}

interface BridgeTokensStepsPrefetch {
  rTokenAllowance?: Decimal;
}

export interface BridgeTokensStepType {
  name: 'approve' | 'bridgeTokens';
}

export interface BridgeTokensStep {
  type: BridgeTokensStepType;
  stepNumber: number;
  numberOfSteps: number;
  action: () => Promise<TransactionResponse>;
}

export type SupportedBridgeNetworks = 'ethereum' | 'ethereumSepolia' | 'base' | 'arbitrumGoerli';

export const SUPPORTED_BRIDGE_NETWORKS: SupportedBridgeNetworks[] = [
  'ethereum',
  'ethereumSepolia',
  'base',
  'arbitrumGoerli',
];

interface BridgeNetworkConfig {
  routerAddress: string;
  chainSelector: string;
  tokenAddress: string;
}

export const BRIDGE_NETWORKS: { [key in SupportedBridgeNetworks]: BridgeNetworkConfig } = {
  ethereum: {
    routerAddress: '0xE561d5E02207fb5eB32cca20a699E0d8919a1476',
    chainSelector: '5009297550715157269',
    tokenAddress: '',
  },
  ethereumSepolia: {
    routerAddress: '0xd0daae2231e9cb96b94c8512223533293c3693bf',
    chainSelector: '16015286601757825753',
    tokenAddress: '0x466D489b6d36E7E3b824ef491C225F5830E81cC1', // CCIP-LnM - Token for testing bridging integration
  },
  base: {
    routerAddress: '', // TODO - Once Chainlink deploys router for Base chain add address for it
    chainSelector: '',
    tokenAddress: '',
  },
  arbitrumGoerli: {
    routerAddress: '0x88E492127709447A5ABEFdaB8788a15B4567589E',
    chainSelector: '6101244977088475029',
    tokenAddress: '',
  },
};

export const BRIDGE_NETWORK_LANES: { [key in SupportedBridgeNetworks]: SupportedBridgeNetworks[] } = {
  ethereum: ['base'],
  ethereumSepolia: ['arbitrumGoerli'],
  base: ['ethereum'],
  arbitrumGoerli: ['ethereumSepolia'],
};

export class Bridge {
  private user: Signer;

  constructor(user: Signer) {
    this.user = user;
  }

  async *getBridgeRSteps(
    sourceChainName: SupportedBridgeNetworks,
    destinationChainName: SupportedBridgeNetworks,
    amountToBridge: Decimal,
    options: BridgeTokensOptions & BridgeTokensStepsPrefetch = {},
  ): AsyncGenerator<BridgeTokensStep> {
    const { gasLimitMultiplier = Decimal.ONE, frontendTag } = options;

    let { rTokenAllowance } = options;

    const sourceChainTokenAddress = BRIDGE_NETWORKS[sourceChainName].tokenAddress;
    const sourceChainRouterAddress = BRIDGE_NETWORKS[sourceChainName].routerAddress;
    const destinationChainSelector = BRIDGE_NETWORKS[destinationChainName].chainSelector;

    const sourceChainRouter = CCIPRouter__factory.connect(sourceChainRouterAddress, this.user);

    const tokenAmounts = [
      {
        token: sourceChainTokenAddress,
        amount: amountToBridge.toBigInt().toString(),
      },
    ];

    const functionSelector = ethers.id('CCIP EVMExtraArgsV1').slice(0, 10);

    const extraArgs = AbiCoder.defaultAbiCoder().encode(['uint256', 'bool'], [0, false]);

    const encodedExtraArgs = functionSelector + extraArgs.slice(2);

    const message = {
      receiver: AbiCoder.defaultAbiCoder().encode(['address'], [await this.user.getAddress()]),
      data: '0x', // data is empty because we are only transferring R
      tokenAmounts: tokenAmounts,
      feeToken: ZeroAddress, // We want to pay for fees in native token
      extraArgs: encodedExtraArgs,
    };

    const fees = await sourceChainRouter.getFee(destinationChainSelector, message);

    const sourceChainTokenContract = ERC20__factory.connect(sourceChainTokenAddress, this.user);

    if (rTokenAllowance === undefined) {
      rTokenAllowance = new Decimal(
        await sourceChainTokenContract.allowance(this.user, sourceChainRouterAddress),
        Decimal.PRECISION,
      );
    }

    const tokenApprovalNeeded = amountToBridge.gt(rTokenAllowance);

    const numberOfSteps = Number(tokenApprovalNeeded) + 1;
    let stepCounter = 1;

    if (tokenApprovalNeeded) {
      yield {
        type: {
          name: 'approve',
        },
        stepNumber: stepCounter++,
        numberOfSteps,
        action: () => sourceChainTokenContract.approve(sourceChainRouterAddress, amountToBridge.toBigInt()),
      };
    }

    yield {
      type: {
        name: 'bridgeTokens',
      },
      stepNumber: stepCounter++,
      numberOfSteps,
      action: () =>
        sendTransactionWithGasLimit(
          sourceChainRouter.ccipSend,
          [destinationChainSelector, message],
          gasLimitMultiplier,
          frontendTag,
          this.user,
          fees,
        ),
    };
  }

  async waitForBridgeToComplete(
    bridgeTransaction: ContractTransactionResponse,
    bridgeTransactionReceipt: TransactionReceipt,
    sourceChainName: SupportedBridgeNetworks,
    destinationChainRpc: string,
    destinationChainName: SupportedBridgeNetworks,
    pollInterval = 60000, // 60 seconds in milliseconds
    timeout = 40 * 60 * 1000, // 40 minutes in milliseconds
  ) {
    const call = {
      from: bridgeTransaction.from,
      to: bridgeTransaction.to,
      data: bridgeTransaction.data,
      gasLimit: bridgeTransaction.gasLimit,
      gasPrice: bridgeTransaction.gasPrice,
      value: bridgeTransaction.value,
      blockTag: bridgeTransactionReceipt.blockNumber - 1,
    };

    const messageId = await this.user.call(call);

    const sourceChainSelector = BRIDGE_NETWORKS[sourceChainName].chainSelector;

    const destinationProvider = new JsonRpcProvider(destinationChainRpc);
    const destinationRouterAddress = BRIDGE_NETWORKS[destinationChainName].routerAddress;

    const destinationRouterContract = CCIPRouter__factory.connect(destinationRouterAddress, destinationProvider);

    const pollStatus = async () => {
      // Fetch the OffRamp contract addresses on the destination chain
      const offRamps = await destinationRouterContract.getOffRamps();

      // Iterate through OffRamps to find the one linked to the source chain and check message status
      for (const offRamp of offRamps) {
        if (offRamp.sourceChainSelector.toString() === sourceChainSelector) {
          const offRampContract = CCIPOffRamp__factory.connect(offRamp.offRamp, destinationProvider);
          const events = await offRampContract.queryFilter(offRampContract.filters.ExecutionStateChanged);

          // Check if an event with the specific messageId exists and log its status
          for (const event of events) {
            if (event.args && event.args.messageId === messageId) {
              const state = event.args.state;
              const status = getMessageState(Number(state));
              console.log(
                `\nStatus of message ${messageId} is ${status} - Check the explorer https://ccip.chain.link/msg/${messageId} for more information.`,
              );

              // Clear the polling and the timeout
              clearInterval(pollingId);
              clearTimeout(timeoutId);
              return;
            }
          }
        }
      }
      // If no event found, the message has not yet been processed on the destination chain
      console.info(
        `Message ${messageId} has not been processed yet on the destination chain. Checking again in ${pollInterval} milliseconds. Check the explorer https://ccip.chain.link/msg/${messageId} for status.`,
      );
    };

    // Start polling
    console.info(
      `\nWaiting for message ${messageId} to be executed on the destination chain - Check the explorer https://ccip.chain.link/msg/${messageId} for status.`,
    );
    const pollingId = setInterval(pollStatus, pollInterval);

    // Set timeout to stop polling after specified timeout period
    const timeoutId = setTimeout(() => {
      console.info(
        `\nTimeout reached. Stopping polling - check the explorer https://ccip.chain.link/msg/${messageId} for status.`,
      );
      clearInterval(pollingId);
    }, timeout);
  }
}

type ExecutionState = 'UNTOUCHED' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE';

const messageExecutionState: { [key: number]: ExecutionState } = {
  0: 'UNTOUCHED',
  1: 'IN_PROGRESS',
  2: 'SUCCESS',
  3: 'FAILURE',
};

const getMessageState = (status: number) => {
  if (status in messageExecutionState) {
    return messageExecutionState[status];
  }
  return 'unknown';
};
