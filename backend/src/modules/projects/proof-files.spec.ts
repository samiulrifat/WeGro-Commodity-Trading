import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../../../test/support/unit';
import { IdentityCryptoService } from '../../common/crypto/identity-crypto.service';
import { MAX_PROOF_BYTES, MAX_PROOF_FILES, ProofFiles } from './proof-files';

// The disk refuses the final rename, or the clean-up too, when a test asks.
let renameFails = false;
let unlinkFails = false;
jest.mock('node:fs/promises', () => {
  const actual =
    jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    rename: jest.fn((from: string, to: string) =>
      renameFails
        ? Promise.reject(new Error('EXDEV: cross-device'))
        : actual.rename(from, to),
    ),
    unlink: jest.fn((path: string) =>
      unlinkFails
        ? Promise.reject(new Error('EBUSY: resource busy'))
        : actual.unlink(path),
    ),
  };
});

/** Payment proof files: checked whole first, sealed on disk, opened only for their row. */
describe('ProofFiles', () => {
  let root: string;
  let files: ProofFiles;
  const pdf = Buffer.from('%PDF-1.4 bank statement');
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wegro-proofs-'));
    files = new ProofFiles(
      config({ UPLOAD_DIR: root }),
      new IdentityCryptoService(
        config({ IDENTITY_MASTER_KEY: 'ab'.repeat(32) }),
      ),
    );
    renameFails = false;
    unlinkFails = false;
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('takes one to three files, each of some size and a known type', () => {
    expect(files.check([pdf])).toEqual(['application/pdf']);
    const code = (f: () => unknown) => {
      try {
        f();
      } catch (e) {
        return (e as { getResponse: () => { code: string } }).getResponse()
          .code;
      }
    };
    expect(code(() => files.check([]))).toBe('PROOF_FILE_COUNT');
    expect(code(() => files.check(Array(MAX_PROOF_FILES + 1).fill(pdf)))).toBe(
      'PROOF_FILE_COUNT',
    );
    expect(code(() => files.check([Buffer.alloc(0)]))).toBe('PROOF_FILE_SIZE');
    expect(code(() => files.check([Buffer.alloc(MAX_PROOF_BYTES + 1)]))).toBe(
      'PROOF_FILE_SIZE',
    );
    expect(code(() => files.check([Buffer.from('plain text')]))).toBe(
      'PROOF_FILE_TYPE',
    );
  });

  it('seals a file on disk and opens it only for its own row', async () => {
    const sealed = await files.store(pdf, 'application/pdf');
    await expect(files.read(sealed)).resolves.toEqual(pdf);
    // Moved to another row, or changed on disk: it will not open.
    await expect(
      files.read({ ...sealed, id: 'another-file' }),
    ).resolves.toBeNull();
    const path = join(root, sealed.storagePath);
    const bytes = readFileSync(path);
    const last = bytes.length - 1;
    bytes.writeUInt8(bytes.readUInt8(last) ^ 1, last);
    writeFileSync(path, bytes);
    await expect(files.read(sealed)).resolves.toBeNull();
    await files.remove(sealed.storagePath);
    expect(existsSync(join(root, sealed.storagePath))).toBe(false);
    await expect(files.read(sealed)).rejects.toMatchObject({
      response: { code: 'PROOF_FILE_MISSING' },
    });
    // Removing what is already gone is fine.
    await expect(files.remove(sealed.storagePath)).resolves.toBeUndefined();
  });

  it('leaves nothing behind when the file cannot be moved into place', async () => {
    renameFails = true;
    await expect(files.store(pdf, 'application/pdf')).rejects.toThrow('EXDEV');
    const [shard] = readdirSync(join(root, 'proofs'));
    expect(readdirSync(join(root, 'proofs', shard))).toEqual([]);
  });

  it('reports the failed move, not a failed clean-up after it', async () => {
    renameFails = true;
    unlinkFails = true;
    await expect(files.store(pdf, 'application/pdf')).rejects.toThrow('EXDEV');
  });
});
