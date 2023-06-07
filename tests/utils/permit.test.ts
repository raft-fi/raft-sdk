import { Decimal } from '@tempusfinance/decimal';
import { Signer } from 'ethers';
import { ERC20Permit__factory } from '../../src/typechain';
import { createEmptyPermitSignature, createPermitSignature } from '../../src/utils';

describe('createEmptyPermitSignature', () => {
  it('should return an empty permit signature', () => {
    const emptySignature = createEmptyPermitSignature();

    expect(emptySignature).toEqual({
      token: '0x0000000000000000000000000000000000000000',
      value: 0,
      deadline: 0,
      v: 0,
      r: '0x0000000000000000000000000000000000000000000000000000000000000000',
      s: '0x0000000000000000000000000000000000000000000000000000000000000000',
    });
  });
});

describe('createPermitSignature', () => {
  it('should return a permit signature', () => {
    const signer = {
      getAddress: jest.fn().mockResolvedValue('0x123'),
      signTypedData: jest.fn().mockResolvedValue({ v: 1, r: '0x000', s: '0xfff' }),
    } as unknown as Signer;
    const token = ERC20Permit__factory.connect('0x456');

    jest.spyOn(token, 'name').mockResolvedValue('Test Token');
    jest.spyOn(token, 'getAddress').mockResolvedValue('0x456');
    jest.spyOn(token, 'nonces').mockResolvedValue(0n);

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
