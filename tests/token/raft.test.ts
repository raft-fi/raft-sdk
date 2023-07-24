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
      const result = await token.estimateStakeApr(stakeAmount, period, { veRaftTotalSupply, annualGiveAway });
      expect(result.toString().substring(0, 6)).toBe(expected.toString().substring(0, 6));
    }
  });
});
