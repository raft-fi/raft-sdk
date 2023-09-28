import { PriceFeed, UserPosition } from '@raft-fi/sdk';
import { Decimal } from '@tempusfinance/decimal';
import { JsonRpcProvider, Wallet } from 'ethers';

async function main() {
  const provider = new JsonRpcProvider(import.meta.env.VITE_JSON_RPC_PROVIDER);
  const signer = Wallet.fromPhrase(import.meta.env.VITE_WALLET_MNEMONIC, provider);

  const position = new UserPosition(signer, 'wstETH');
  position.fetch(); // Fetch position data from blockchain

  // Use price feed to get current price of wstETH
  const priceFeed = new PriceFeed(provider);
  const collateralPrice = await priceFeed.getPrice('wstETH');

  console.log(`Current position: ${position.getCollateral()} wstETH, ${position.getDebt()} R`);
  console.log(`Current collateral ratio: ${position.getCollateralRatio(collateralPrice).mul(100)}%`);

  await position.open(new Decimal(1), new Decimal(3000), { collateralToken: 'stETH' });

  // Now you can use other methods like `addCollateral`, `withdrawCollateral`, `borrow`, `repayDebt`, `close`, ...
}

main();
