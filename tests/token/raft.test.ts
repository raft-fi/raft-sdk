import { Decimal } from '@tempusfinance/decimal';
import { Provider } from 'ethers';
import { describe, expect, it, vi } from 'vitest';
import { RaftToken } from '../../src/token';

describe('RaftToken', () => {
  const DUMMY_ADDRESS = '0x0';
  const DUMMY_PROVIDER = {} as Provider;
  const YEAR_IN_SEC = 365 * 24 * 60 * 60;
  const YEAR_IN_MS = YEAR_IN_SEC * 1000;

  it('should return the correct estimated APR based on different input', async () => {
    const token = new RaftToken(DUMMY_ADDRESS, DUMMY_PROVIDER);
    vi.spyOn(token, 'fetchVeRaftAvgTotalSupply').mockResolvedValue(new Decimal(34567890));
    vi.spyOn(token, 'getMaxVeLockPeriod').mockResolvedValue(2 * YEAR_IN_SEC);
    vi.spyOn(token, 'getAnnualGiveAway').mockReturnValue(new Decimal(33333333));
    vi.spyOn(Date, 'now').mockReturnValue(0);

    const tests = [
      {
        bptAmount: new Decimal(123456),
        unlockTime: new Date(2 * YEAR_IN_MS),
        expected: '0.24014311025686594',
      },
      {
        bptAmount: new Decimal(123456),
        unlockTime: new Date(YEAR_IN_MS),
        expected: '0.120178372396786514',
      },
      {
        bptAmount: new Decimal(123456),
        unlockTime: new Date(0.5 * YEAR_IN_MS),
        expected: '0.060115926166118135',
      },
      {
        bptAmount: new Decimal(123456),
        unlockTime: new Date(0.25 * YEAR_IN_MS),
        expected: '0.030064652538262179',
      },
      {
        bptAmount: new Decimal(123456),
        unlockTime: new Date(0),
        expected: '0',
      },
      {
        bptAmount: new Decimal(234567),
        unlockTime: new Date(2 * YEAR_IN_MS),
        expected: '0.239759521505545377',
      },
      {
        bptAmount: new Decimal(234567),
        unlockTime: new Date(YEAR_IN_MS),
        expected: '0.120082227790997352',
      },
      {
        bptAmount: new Decimal(234567),
        unlockTime: new Date(0.5 * YEAR_IN_MS),
        expected: '0.060091858994736769',
      },
      {
        bptAmount: new Decimal(234567),
        unlockTime: new Date(0.25 * YEAR_IN_MS),
        expected: '0.030058631862113471',
      },
      {
        bptAmount: new Decimal(234567),
        unlockTime: new Date(0),
        expected: '0',
      },
    ];

    for (const { bptAmount, unlockTime, expected } of tests) {
      const result = await token.estimateStakingApr(bptAmount, unlockTime, {
        bptLockedBalance: Decimal.ZERO,
        veRaftBalance: Decimal.ZERO,
      });
      expect(result.toString().substring(0, 16)).toBe(expected.substring(0, 16));
    }
  });

  it('should return the correct price impact on different pool data', async () => {
    const poolData = {
      id: '0x5c6ee304399dbdb9c8ef030ab642b10820db8f56000200000000000000000014',
      address: '0x5c6ee304399dbdb9c8ef030ab642b10820db8f56',
      poolType: 'Weighted',
      swapFee: '0.01',
      swapEnabled: true,
      totalWeight: '1',
      totalShares: '14434851.851617235289926345',
      tokens: [
        {
          address: '0xba100000625a3754423978a60c9317c58a424e3d',
          balance: '32516567.381015163261334167',
          decimals: 18,
          priceRate: '1',
          weight: '0.8',
        },
        {
          address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
          balance: '19796.287992334751655521',
          decimals: 18,
          priceRate: '1',
          weight: '0.2',
        },
      ],
      tokensList: ['0xba100000625a3754423978a60c9317c58a424e3d', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'],
    };

    const token = new RaftToken(DUMMY_ADDRESS, DUMMY_PROVIDER);

    const impact0 = await token.calculatePriceImpact(new Decimal(123), { poolData });
    expect(impact0?.toString()).toEqual('-0.000018724441389807');

    const impact1 = await token.calculatePriceImpact(new Decimal(1234), { poolData });
    expect(impact1?.toString()).toEqual('-0.000187866047730067');

    const impact2 = await token.calculatePriceImpact(new Decimal(12345), { poolData });
    expect(impact2?.toString()).toEqual('-0.001880693678155468');

    const impact3 = await token.calculatePriceImpact(new Decimal(123456), { poolData });
    expect(impact3?.toString()).toEqual('-0.018935531646557438');

    const impact4 = await token.calculatePriceImpact(new Decimal(1234567), { poolData });
    expect(impact4?.toString()).toEqual('-0.202607665687961472');
  });
});
