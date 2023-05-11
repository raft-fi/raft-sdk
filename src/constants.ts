import { Decimal } from '@tempusfinance/decimal';

// Protocol constants

export const MIN_COLLATERAL_RATIO = new Decimal(1.1); // 110%
export const MIN_NET_DEBT = new Decimal(3000); // 3000 R

export const PERMIT_DEADLINE_SHIFT = 30 * 60; // 30 minutes

export const TOKENS_WITH_PERMIT = ['wstETH'];
