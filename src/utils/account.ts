import { ContractRunner } from 'ethers';

/**
 * Check if the address is an EOA address.
 * @param address The address to check.
 * @param contractRunner The contract runner.
 * @returns True if the address is an EOA address.
 */
export async function isEoaAddress(address: string, contractRunner: ContractRunner) {
  const code = await contractRunner.provider?.getCode(address);
  return code === '0x';
}
