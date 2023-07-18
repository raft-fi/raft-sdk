import {
  PositionManager,
  PositionManagerStETH,
  PositionManagerStETH__factory,
  PositionManagerWrappedCollateralToken,
  PositionManagerWrappedCollateralToken__factory,
  PositionManager__factory,
} from '../typechain';
import { PositionManagerType } from '../config';
import { ContractRunner } from 'ethers';

type PositionManagerContractTypes = {
  base: PositionManager;
  stETH: PositionManagerStETH;
  wrapped: PositionManagerWrappedCollateralToken;
};

export function getPositionManagerContract<T extends PositionManagerType>(
  type: T,
  address: string,
  runner: ContractRunner,
): PositionManagerContractTypes[T] {
  switch (type) {
    case 'stETH':
      return PositionManagerStETH__factory.connect(address, runner) as PositionManagerContractTypes[T];

    case 'wrapped':
      return PositionManagerWrappedCollateralToken__factory.connect(address, runner) as PositionManagerContractTypes[T];

    default:
      return PositionManager__factory.connect(address, runner) as PositionManagerContractTypes[T];
  }
}
