import { Decimal } from '@tempusfinance/decimal';
import { Provider } from 'ethers';
import { describe, expect, it, vi } from 'vitest';
import { RaftToken, UserVeRaftBalance } from '../../src/token';

describe('RaftToken', () => {
  const DUMMY_ADDRESS = '0x0';
  const DUMMY_PROVIDER = {} as Provider;
  const YEAR_IN_SEC = 365 * 24 * 60 * 60;
  const YEAR_IN_MS = YEAR_IN_SEC * 1000;

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
        address: '0x4c5cb5d87709387f8821709f7a6664f00dcf0c93',
        balance: '32516567.381015163261334167',
        decimals: 18,
        priceRate: '1',
        weight: '0.8',
      },
      {
        address: '0x183015a9ba6ff60230fdeadc3f43b3d788b13e21',
        balance: '19796.287992334751655521',
        decimals: 18,
        priceRate: '1',
        weight: '0.2',
      },
    ],
    tokensList: ['0x4c5cb5d87709387f8821709f7a6664f00dcf0c93', '0x183015a9ba6ff60230fdeadc3f43b3d788b13e21'],
  };

  it('should return the correct estimated APR based on different input, no existing stake', async () => {
    const token = new RaftToken(DUMMY_ADDRESS, DUMMY_PROVIDER);
    vi.spyOn(token, 'calculateTotalVeRaftAnnualShare').mockResolvedValue(new Decimal(34567890));
    vi.spyOn(token, 'getMaxVeLockPeriod').mockResolvedValue(2 * YEAR_IN_SEC);
    vi.spyOn(token, 'getAnnualGiveAway').mockReturnValue(new Decimal(33333333));
    vi.spyOn(token, 'getBptAmountFromRaft').mockResolvedValue(new Decimal(1));
    vi.spyOn(Date, 'now').mockReturnValue(0);

    const tests = [
      {
        bptAmount: new Decimal(123456),
        unlockTime: new Date(2 * YEAR_IN_MS),
        expected: '0.719470541732917037',
      },
      {
        bptAmount: new Decimal(123456),
        unlockTime: new Date(YEAR_IN_MS),
        expected: '0.240037826434745426',
      },
      {
        bptAmount: new Decimal(123456),
        unlockTime: new Date(0.5 * YEAR_IN_MS),
        expected: '0.060049495659548021',
      },
      {
        bptAmount: new Decimal(123456),
        unlockTime: new Date(0.25 * YEAR_IN_MS),
        expected: '0.01501487844298804',
      },
      {
        bptAmount: new Decimal(123456),
        unlockTime: new Date(0),
        expected: '0',
      },
      {
        bptAmount: new Decimal(234567),
        unlockTime: new Date(2 * YEAR_IN_MS),
        expected: '0.71774921205561505',
      },
      {
        bptAmount: new Decimal(234567),
        unlockTime: new Date(YEAR_IN_MS),
        expected: '0.239845919647295439',
      },
      {
        bptAmount: new Decimal(234567),
        unlockTime: new Date(0.5 * YEAR_IN_MS),
        expected: '0.060037478270475757',
      },
      {
        bptAmount: new Decimal(234567),
        unlockTime: new Date(0.25 * YEAR_IN_MS),
        expected: '0.015014126992759619',
      },
      {
        bptAmount: new Decimal(234567),
        unlockTime: new Date(0),
        expected: '0',
      },
    ];

    for (const { bptAmount, unlockTime, expected } of tests) {
      const result = await token.estimateStakingApr(bptAmount, unlockTime, {
        userVeRaftBalance: { veRaftBalance: Decimal.ZERO } as UserVeRaftBalance,
        poolData,
      });
      expect(result.toString().substring(0, 16)).toBe(expected.substring(0, 16));
    }
  });

  it('should return the correct estimated APR based on different input, with existing stake', async () => {
    const token = new RaftToken(DUMMY_ADDRESS, DUMMY_PROVIDER);
    vi.spyOn(token, 'calculateTotalVeRaftAnnualShare').mockResolvedValue(new Decimal(34567890));
    vi.spyOn(token, 'getMaxVeLockPeriod').mockResolvedValue(2 * YEAR_IN_SEC);
    vi.spyOn(token, 'getAnnualGiveAway').mockReturnValue(new Decimal(33333333));
    vi.spyOn(token, 'getBptAmountFromRaft').mockResolvedValue(new Decimal(1));
    vi.spyOn(Date, 'now').mockReturnValue(0);

    const tests = [
      {
        bptAmount: new Decimal(123456),
        unlockTime: new Date(2 * YEAR_IN_MS),
        expected: '0.721550941900645252',
      },
      {
        bptAmount: new Decimal(123456),
        unlockTime: new Date(YEAR_IN_MS),
        expected: '0.240733152195006668',
      },
      {
        bptAmount: new Decimal(123456),
        unlockTime: new Date(0.5 * YEAR_IN_MS),
        expected: '0.060223559478386645',
      },
      {
        bptAmount: new Decimal(123456),
        unlockTime: new Date(0.25 * YEAR_IN_MS),
        expected: '0.015058408939572996',
      },
      {
        bptAmount: new Decimal(123456),
        unlockTime: new Date(0),
        expected: '0',
      },
      {
        bptAmount: new Decimal(234567),
        unlockTime: new Date(2 * YEAR_IN_MS),
        expected: '0.719819655114133613',
      },
      {
        bptAmount: new Decimal(234567),
        unlockTime: new Date(YEAR_IN_MS),
        expected: '0.240540132438391967',
      },
      {
        bptAmount: new Decimal(234567),
        unlockTime: new Date(0.5 * YEAR_IN_MS),
        expected: '0.060211472326403206',
      },
      {
        bptAmount: new Decimal(234567),
        unlockTime: new Date(0.25 * YEAR_IN_MS),
        expected: '0.015057653125993203',
      },
      {
        bptAmount: new Decimal(234567),
        unlockTime: new Date(0),
        expected: '0',
      },
    ];

    for (const { bptAmount, unlockTime, expected } of tests) {
      const result = await token.estimateStakingApr(bptAmount, unlockTime, {
        userVeRaftBalance: {
          veRaftBalance: new Decimal(200000),
          unlockTime: new Date(YEAR_IN_MS),
        } as UserVeRaftBalance,
        poolData,
      });
      expect(result.toString().substring(0, 16)).toBe(expected.substring(0, 16));
    }
  });

  it('should return the correct price impact on different pool data', async () => {
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
