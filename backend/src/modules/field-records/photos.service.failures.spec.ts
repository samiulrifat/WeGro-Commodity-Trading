import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config, fakeRepo } from '../../../test/support/unit';
import { PhotosService } from './photos.service';

// The disk refuses the final rename (and the clean-up, when a test asks);
// the cleaner fails for a reason of its own.
let unlinkFails = false;
jest.mock('node:fs/promises', () => {
  const actual =
    jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    rename: jest.fn(() => Promise.reject(new Error('EXDEV: cross-device'))),
    unlink: jest.fn((path: string) =>
      unlinkFails
        ? Promise.reject(new Error('EBUSY: resource busy'))
        : actual.unlink(path),
    ),
  };
});
jest.mock('./photo-sanitise', () => ({
  ...jest.requireActual<object>('./photo-sanitise'),
  stripMetadata: jest.fn((data: Buffer) => {
    if (data.includes('explode')) throw new TypeError('bug in the cleaner');
    return data;
  }),
}));

/** Storing a photo when the disk or the cleaner fails: nothing half-written stays. */
describe('PhotosService when storing fails', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wegro-photos-'));
  });
  afterEach(() => {
    unlinkFails = false;
    rmSync(root, { recursive: true, force: true });
  });

  const jpeg = (label: string) =>
    Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x04, 0x01, 0x02]),
      Buffer.from(label, 'latin1'),
      Buffer.from([0xff, 0xd9]),
    ]);
  const service = () =>
    new PhotosService(config({ UPLOAD_DIR: root }), fakeRepo() as never);

  it('removes the temporary file when it cannot be moved into place', async () => {
    await expect(service().store(jpeg('leaf'), 'u1')).rejects.toThrow('EXDEV');
    const [shard] = readdirSync(join(root, 'photos'));
    expect(readdirSync(join(root, 'photos', shard))).toEqual([]);
  });

  it('reports the failed move, not a failed clean-up after it', async () => {
    unlinkFails = true;
    await expect(service().store(jpeg('leaf'), 'u1')).rejects.toThrow('EXDEV');
  });

  it('passes on a failure that is not a damaged image', async () => {
    await expect(service().store(jpeg('explode'), 'u1')).rejects.toThrow(
      'bug in the cleaner',
    );
  });
});
