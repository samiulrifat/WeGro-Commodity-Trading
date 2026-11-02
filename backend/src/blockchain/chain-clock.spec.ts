import { ChainClock } from './chain-clock';

/** The chain's time, read once a second and never kept when the read failed. */
describe('ChainClock', () => {
  const clock = (getBlock: jest.Mock) =>
    new ChainClock({ provider: { getBlock } } as never);

  it('shares one reading between calls close together', async () => {
    const getBlock = jest.fn(() =>
      Promise.resolve({ timestamp: 1_800_000_000 }),
    );
    const c = clock(getBlock);
    const [a, b] = await Promise.all([c.now(), c.now()]);
    expect(a).toEqual(new Date(1_800_000_000_000));
    expect(b).toBe(a);
    expect(getBlock).toHaveBeenCalledTimes(1);
    c.forget();
    await c.now();
    expect(getBlock).toHaveBeenCalledTimes(2);
  });

  it('asks again after a failed reading instead of keeping the failure', async () => {
    const getBlock = jest
      .fn()
      .mockRejectedValueOnce(new Error('node down'))
      .mockResolvedValue({ timestamp: 1_800_000_000 });
    const c = clock(getBlock);
    await expect(c.now()).rejects.toThrow('node down');
    await expect(c.now()).resolves.toEqual(new Date(1_800_000_000_000));
  });
});
