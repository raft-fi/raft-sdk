import { Decimal } from '@tempusfinance/decimal';
import { Signer } from 'ethers';
import { describe, expect, it, vi } from 'vitest';
import { ERC20Permit__factory } from '../../src/typechain';
import { createPermitSignature } from '../../src/utils';

describe('createPermitSignature', () => {
  it('should return a permit signature', () => {
    const signer = {
      getAddress: vi.fn().mockResolvedValue('0x123'),
      signTypedData: vi.fn().mockResolvedValue({ v: 1, r: '0x000', s: '0xfff' }),
    } as unknown as Signer;
    const token = ERC20Permit__factory.connect('0x456');

    vi.spyOn(token, 'name').mockResolvedValue('Test Token');
    vi.spyOn(token, 'getAddress').mockResolvedValue('0x456');
    vi.spyOn(token, 'nonces').mockResolvedValue(0n);

    const signature = createPermitSignature(signer, Decimal.ONE, '0x789', token);

    expect(signature).resolves.toEqual({
      token: '0x456',
      value: Decimal.ONE.toBigInt(),
      deadline: expect.any(Number),
      v: 28,
      r: '0x0000000000000000000000000000000000000000000000000000000000000000',
      s: '0x0000000000000000000000000000000000000000000000000000000000000fff',
    });
  });
});
