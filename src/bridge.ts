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
import { RToken, R_TOKEN, TransactionWithFeesOptions } from './types';
import { ApproveStep, BaseStep, buildTransactionWithGasLimit, getApproveTokenStep } from './utils';
import { ETH_PRECISION } from './constants';
import { getTokenAllowance } from './allowance';

export interface BridgeTokensOptions extends TransactionWithFeesOptions {
  frontendTag?: string;
}

interface BridgeTokensStepsPrefetch {
  rTokenAllowance?: Decimal;
}

export interface BridgeTokensStepType {
  name: 'approve' | 'bridgeTokens';
}

export interface BridgeStep
  extends BaseStep<
    {
      name: 'bridge';
    },
    TransactionResponse
  > {
  bridgeFee: Decimal;
}
export type BridgeTokensStep = ApproveStep<RToken> | BridgeStep;

export type SupportedBridgeNetwork = 'mainnet' | 'ethereumSepolia' | 'base' | 'arbitrumGoerli';
export type SupportedBridgeToken = 'R' | 'CCIP-LnM' | 'clCCIP-LnM';

export const SUPPORTED_BRIDGE_NETWORKS: SupportedBridgeNetwork[] = [
  'mainnet',
  'ethereumSepolia',
  'base',
  'arbitrumGoerli',
];

interface BridgeNetworkConfig {
  routerAddress: string;
  chainSelector: string;
  tokenAddress: string;
  tokenTicker: SupportedBridgeToken;
  tokenDecimals: number;
}

export const BRIDGE_NETWORKS: { [key in SupportedBridgeNetwork]: BridgeNetworkConfig } = {
  mainnet: {
    routerAddress: '0x48d2Ae51E665298000A42f924E7Ad09914f21821',
    chainSelector: '5009297550715157269',
    tokenAddress: '0x183015a9ba6ff60230fdeadc3f43b3d788b13e21',
    tokenTicker: 'R',
    tokenDecimals: 18,
  },
  ethereumSepolia: {
    routerAddress: '0xd0daae2231e9cb96b94c8512223533293c3693bf',
    chainSelector: '16015286601757825753',
    tokenAddress: '0x466D489b6d36E7E3b824ef491C225F5830E81cC1',
    tokenTicker: 'CCIP-LnM',
    tokenDecimals: 18,
  },
  base: {
    routerAddress: '0xe6d29aDa21574C1fCb02bd49aD2347B19766CBC9',
    chainSelector: '15971525489660198786',
    tokenAddress: '0xafb2820316e7bc5ef78d295ab9b8bb2257534576',
    tokenTicker: 'R',
    tokenDecimals: 18,
  },
  arbitrumGoerli: {
    routerAddress: '0x88E492127709447A5ABEFdaB8788a15B4567589E',
    chainSelector: '6101244977088475029',
    tokenAddress: '0x0E14dBe2c8e1121902208be173A3fb91Bb125CDB',
    tokenTicker: 'clCCIP-LnM',
    tokenDecimals: 18,
  },
};

export const BRIDGE_NETWORK_LANES: { [key in SupportedBridgeNetwork]: SupportedBridgeNetwork[] } = {
  mainnet: ['base'],
  ethereumSepolia: ['arbitrumGoerli'],
  base: ['mainnet'],
  arbitrumGoerli: ['ethereumSepolia'],
};

export class Bridge {
  private user: Signer;

  constructor(user: Signer) {
    this.user = user;
  }

  async *getBridgeRSteps(
    sourceChainName: SupportedBridgeNetwork,
    destinationChainName: SupportedBridgeNetwork,
    amountToBridge: Decimal,
    options: BridgeTokensOptions & BridgeTokensStepsPrefetch = {},
  ): AsyncGenerator<BridgeTokensStep> {
    const { gasLimitMultiplier = Decimal.ONE, frontendTag } = options;

    let { rTokenAllowance } = options;

    const sourceTokenPrecision = BRIDGE_NETWORKS[sourceChainName].tokenDecimals;
    const sourceChainTokenAddress = BRIDGE_NETWORKS[sourceChainName].tokenAddress;
    const destinationChainSelector = BRIDGE_NETWORKS[destinationChainName].chainSelector;

    const sourceChainRouter = CCIPRouter__factory.connect(BRIDGE_NETWORKS[sourceChainName].routerAddress, this.user);

    const tokenAmounts = [
      {
        token: sourceChainTokenAddress,
        amount: amountToBridge.toBigInt(sourceTokenPrecision).toString(),
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

    const ccipFeeBigInt = await sourceChainRouter.getFee(destinationChainSelector, message);
    // Fee is paid in native token (ETH) so we use ETH_PRECISION here.
    const ccipFee = new Decimal(ccipFeeBigInt, ETH_PRECISION);

    const sourceChainTokenContract = ERC20__factory.connect(sourceChainTokenAddress, this.user);

    if (rTokenAllowance === undefined) {
      rTokenAllowance = await getTokenAllowance(R_TOKEN, sourceChainTokenContract, this.user, sourceChainRouter);
    }

    const tokenApprovalNeeded = amountToBridge.gt(rTokenAllowance);

    const numberOfSteps = Number(tokenApprovalNeeded) + 1;
    let stepCounter = 1;

    if (tokenApprovalNeeded) {
      yield* getApproveTokenStep(
        R_TOKEN,
        sourceChainTokenContract,
        amountToBridge,
        sourceChainRouter,
        stepCounter++,
        numberOfSteps,
      );
    }

    const { sendTransaction, gasEstimate } = await buildTransactionWithGasLimit(
      sourceChainRouter.ccipSend,
      [destinationChainSelector, message],
      gasLimitMultiplier,
      frontendTag,
      this.user,
      ccipFeeBigInt,
    );

    yield {
      type: {
        name: 'bridge',
      },
      stepNumber: stepCounter++,
      numberOfSteps,
      gasEstimate,
      bridgeFee: ccipFee,
      action: sendTransaction,
    };
  }

  async getBridgeMessageId(
    bridgeTransaction: ContractTransactionResponse,
    bridgeTransactionReceipt: TransactionReceipt,
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

    return messageId;
  }

  async waitForBridgeToComplete(
    messageId: string,
    sourceChainName: SupportedBridgeNetwork,
    destinationChainRpc: string,
    destinationChainName: SupportedBridgeNetwork,
    pollInterval = 60000, // 60 seconds in milliseconds
    timeout = 40 * 60 * 1000, // 40 minutes in milliseconds
  ) {
    const sourceChainSelector = BRIDGE_NETWORKS[sourceChainName].chainSelector;

    const destinationProvider = new JsonRpcProvider(destinationChainRpc);
    const destinationRouterAddress = BRIDGE_NETWORKS[destinationChainName].routerAddress;

    const destinationRouterContract = CCIPRouter__factory.connect(destinationRouterAddress, destinationProvider);

    return new Promise<void>((resolve, reject) => {
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
                resolve();
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
        clearInterval(pollingId);
        const errorMsg = `Timeout reached. Stopping polling - check the explorer https://ccip.chain.link/msg/${messageId} for status.`;
        reject(new Error(errorMsg));
      }, timeout);
    });
  }

  async fetchBalance(network: SupportedBridgeNetwork, rpc: string) {
    const provider = new JsonRpcProvider(rpc);

    const { tokenAddress, tokenDecimals } = BRIDGE_NETWORKS[network];
    if (!tokenAddress) {
      console.warn(`Token address for ${network} is not defined!`);

      return Decimal.ZERO;
    }

    const tokenContract = ERC20__factory.connect(tokenAddress, provider);

    const balance = await tokenContract.balanceOf(this.user);

    return new Decimal(balance, tokenDecimals);
  }

  async fetchAllowance(network: SupportedBridgeNetwork, rpc: string) {
    const provider = new JsonRpcProvider(rpc);

    const { routerAddress: spender, tokenAddress, tokenDecimals } = BRIDGE_NETWORKS[network];
    if (!tokenAddress) {
      console.warn(`Token address for ${network} is not defined!`);

      return Decimal.ZERO;
    }

    const tokenContract = ERC20__factory.connect(tokenAddress, provider);

    const allowance = await tokenContract.allowance(this.user, spender);

    return new Decimal(allowance, tokenDecimals);
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

export function isSupportedBridgeNetwork(value: string): value is SupportedBridgeNetwork {
  const networks: string[] = [...SUPPORTED_BRIDGE_NETWORKS];
  if (networks.includes(value)) {
    return true;
  }
  return false;
}
