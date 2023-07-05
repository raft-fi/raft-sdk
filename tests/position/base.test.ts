import { Decimal } from '@tempusfinance/decimal';
import { Position } from '../../src/position';

describe('Position', () => {
  it('should calculate the collateral ratio', () => {
    const tests = [
      {
        collateral: '0',
        debt: '0',
        price: '1',
        expected: Decimal.MAX_DECIMAL,
      },
      {
        collateral: '1',
        debt: '0',
        price: '1',
        expected: Decimal.MAX_DECIMAL,
      },
      {
        collateral: '0',
        debt: '1',
        price: '1',
        expected: Decimal.ZERO,
      },
      {
        collateral: '1',
        debt: '1',
        price: '1',
        expected: Decimal.ONE,
      },
      {
        collateral: '1.2',
        debt: '3000',
        price: '3000',
        expected: new Decimal(1.2),
      },
    ];

    for (const { collateral, debt, price, expected } of tests) {
      const position = new Position('wstETH', new Decimal(collateral), new Decimal(debt));
      const ratio = position.getCollateralRatio(new Decimal(price));

      expect(ratio).toEqual(expected);
    }
  });

  it('should set and get the collateral and debt amount', () => {
    const position = new Position('wstETH');

    position.setCollateral(Decimal.ONE);
    expect(position.getCollateral()).toEqual(Decimal.ONE);

    expect(() => position.setCollateral(new Decimal(-2))).toThrowError('Amount cannot be negative');

    position.setDebt(new Decimal(2));
    expect(position.getDebt()).toEqual(new Decimal(2));

    expect(() => position.setDebt(new Decimal(-100))).toThrowError('Amount cannot be negative');
  });

  it('should return if the position has collateral ratio below minimum', () => {
    const position = new Position('wstETH');
    const tests = [
      {
        collateral: '0',
        debt: '0',
        price: '1',
        expected: false,
      },
      {
        collateral: '1',
        debt: '0',
        price: '1',
        expected: false,
      },
      {
        collateral: '0',
        debt: '1',
        price: '1',
        expected: true,
      },
      {
        collateral: '1',
        debt: '3000',
        price: '3600',
        expected: false,
      },
    ];

    for (const { collateral, debt, price, expected } of tests) {
      position.setCollateral(new Decimal(collateral));
      position.setDebt(new Decimal(debt));

      expect(position.isCollateralRatioBelowMinimum(new Decimal(price))).toEqual(expected);
    }
  });

  it('should return liquidation price limit', () => {
    const tests = [
      {
        collateral: '1.2',
        debt: '3000',
        expected: new Decimal(3000),
      },
      {
        collateral: '1.2',
        debt: '0',
        expected: Decimal.ZERO,
      },
      {
        collateral: '5',
        debt: '3000',
        expected: new Decimal(720),
      },
    ];

    for (const { collateral, debt, expected } of tests) {
      const position = new Position('wstETH', new Decimal(collateral), new Decimal(debt));
      const liquidationPrice = position.getLiquidationPriceLimit();

      expect(liquidationPrice).toEqual(new Decimal(expected));
    }
  });

  it('should return if the position is valid', () => {
    const tests = [
      {
        collateral: '0',
        debt: '0',
        price: '1',
        expected: true,
      },
      {
        collateral: '1',
        debt: '0',
        price: '1',
        expected: false,
      },
      {
        collateral: '0',
        debt: '1',
        price: '1',
        expected: false,
      },
      {
        collateral: '1',
        debt: '3000',
        price: '3600',
        expected: true,
      },
      {
        collateral: '1',
        debt: '3000',
        price: '2000',
        expected: false,
      },
    ];

    for (const { collateral, debt, price, expected } of tests) {
      const position = new Position('wstETH', new Decimal(collateral), new Decimal(debt));

      expect(position.isValid(new Decimal(price))).toEqual(expected);
    }
  });
});
