import { Decimal } from '@tempusfinance/decimal';
import { Provider } from 'ethers';
import { RaftToken } from '../../src/token';

describe('RaftToken', () => {
  const DUMMY_ADDRESS = '0x0';
  const DUMMY_PROVIDER = {} as Provider;

  it('should return the correct estimated APR based on different input', async () => {
    const token = new RaftToken(DUMMY_ADDRESS, DUMMY_PROVIDER);

    const tests = [
      {
        stakeAmount: new Decimal(123456),
        period: 1,
        veRaftTotalSupply: new Decimal(34567890),
        annualGiveAway: new Decimal(33333333),
        expected: new Decimal(0.960854),
      },
      {
        stakeAmount: new Decimal(123456),
        period: 0.5,
        veRaftTotalSupply: new Decimal(34567890),
        annualGiveAway: new Decimal(33333333),
        expected: new Decimal(0.481283),
      },
      {
        stakeAmount: new Decimal(123456),
        period: 0.25,
        veRaftTotalSupply: new Decimal(34567890),
        annualGiveAway: new Decimal(33333333),
        expected: new Decimal(0.240856),
      },
      {
        stakeAmount: new Decimal(123456),
        period: 0,
        veRaftTotalSupply: new Decimal(34567890),
        annualGiveAway: new Decimal(33333333),
        expected: new Decimal(0),
      },
      {
        stakeAmount: new Decimal(234567),
        period: 1,
        veRaftTotalSupply: new Decimal(45678901),
        annualGiveAway: new Decimal(44444444),
        expected: new Decimal(0.968004),
      },
      {
        stakeAmount: new Decimal(234567),
        period: 0.5,
        veRaftTotalSupply: new Decimal(45678901),
        annualGiveAway: new Decimal(44444444),
        expected: new Decimal(0.485241),
      },
      {
        stakeAmount: new Decimal(234567),
        period: 0.25,
        veRaftTotalSupply: new Decimal(45678901),
        annualGiveAway: new Decimal(44444444),
        expected: new Decimal(0.242931),
      },
      {
        stakeAmount: new Decimal(234567),
        period: 0,
        veRaftTotalSupply: new Decimal(45678901),
        annualGiveAway: new Decimal(44444444),
        expected: new Decimal(0),
      },
      {
        stakeAmount: new Decimal(345678),
        period: 1,
        veRaftTotalSupply: new Decimal(56789012),
        annualGiveAway: new Decimal(55555555),
        expected: new Decimal(0.972361),
      },
      {
        stakeAmount: new Decimal(345678),
        period: 0.5,
        veRaftTotalSupply: new Decimal(56789012),
        annualGiveAway: new Decimal(55555555),
        expected: new Decimal(0.487655),
      },
      {
        stakeAmount: new Decimal(345678),
        period: 0.25,
        veRaftTotalSupply: new Decimal(56789012),
        annualGiveAway: new Decimal(55555555),
        expected: new Decimal(0.244198),
      },
      {
        stakeAmount: new Decimal(345678),
        period: 0,
        veRaftTotalSupply: new Decimal(56789012),
        annualGiveAway: new Decimal(55555555),
        expected: new Decimal(0),
      },
      {
        stakeAmount: new Decimal(456789),
        period: 1,
        veRaftTotalSupply: new Decimal(67890123),
        annualGiveAway: new Decimal(66666666),
        expected: new Decimal(0.975415),
      },
      {
        stakeAmount: new Decimal(456789),
        period: 0.5,
        veRaftTotalSupply: new Decimal(67890123),
        annualGiveAway: new Decimal(66666666),
        expected: new Decimal(0.489343),
      },
      {
        stakeAmount: new Decimal(456789),
        period: 0.25,
        veRaftTotalSupply: new Decimal(67890123),
        annualGiveAway: new Decimal(66666666),
        expected: new Decimal(0.245082),
      },
      {
        stakeAmount: new Decimal(456789),
        period: 0,
        veRaftTotalSupply: new Decimal(67890123),
        annualGiveAway: new Decimal(66666666),
        expected: new Decimal(0),
      },
    ];

    for (const { stakeAmount, period, veRaftTotalSupply, annualGiveAway, expected } of tests) {
      const result = await token.estimateStakingApr(stakeAmount, period, { veRaftTotalSupply, annualGiveAway });
      expect(result.toString().substring(0, 6)).toBe(expected.toString().substring(0, 6));
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
