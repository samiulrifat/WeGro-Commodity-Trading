import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdentityCryptoService } from '../../common/crypto/identity-crypto.service';
import { ErrorCode } from '../../common/errors/error-code';
import type { EnvironmentVariables } from '../../config/env.validation';
import { detectType } from '../field-records/photo-sanitise';

export const MAX_PROOF_BYTES = 10 * 1024 * 1024;
export const MAX_PROOF_FILES = 3;

export interface SealedFile {
  id: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storagePath: string;
}

/** A photo (JPEG, PNG, WebP) or a PDF, by its content, not its name. */
export function proofType(data: Buffer): string | null {
  if (data.length >= 5 && data.toString('latin1', 0, 5) === '%PDF-') {
    return 'application/pdf';
  }
  return detectType(data);
}

/**
 * Payment proof files, encrypted at rest under UPLOAD_DIR/proofs/: each is
 * sealed with the identity key, bound to its file id, so a file copied to
 * another record does not open. Written to a temporary name and renamed.
 */
@Injectable()
export class ProofFiles {
  private readonly root: string;

  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    private readonly crypto: IdentityCryptoService,
  ) {
    this.root = resolve(config.get('UPLOAD_DIR', { infer: true }));
  }

  /** Checks every file first, so a bad one stores none. */
  check(files: readonly Buffer[]): string[] {
    if (files.length === 0 || files.length > MAX_PROOF_FILES) {
      throw new UnprocessableEntityException({
        message: `Attach 1 to ${MAX_PROOF_FILES} files`,
        code: ErrorCode.PROOF_FILE_COUNT,
        details: { max: MAX_PROOF_FILES },
      });
    }
    return files.map((data) => {
      if (data.length === 0 || data.length > MAX_PROOF_BYTES) {
        throw new UnprocessableEntityException({
          message: 'Each file must be 1 byte to 10 MB',
          code: ErrorCode.PROOF_FILE_SIZE,
          details: { maxMb: MAX_PROOF_BYTES / 1024 / 1024 },
        });
      }
      const type = proofType(data);
      if (!type) {
        throw new UnsupportedMediaTypeException({
          message: 'Proofs must be photos (JPEG, PNG, WebP) or PDFs',
          code: ErrorCode.PROOF_FILE_TYPE,
        });
      }
      return type;
    });
  }

  async store(data: Buffer, mimeType: string): Promise<SealedFile> {
    const id = randomUUID();
    const storagePath = join('proofs', id.slice(0, 2), `${id}.bin`);
    const target = join(this.root, storagePath);
    await mkdir(dirname(target), { recursive: true });
    const temp = `${target}.${randomUUID()}.tmp`;
    await writeFile(temp, this.crypto.encryptBytes(data, context(id)), {
      flag: 'wx',
    });
    try {
      await rename(temp, target);
    } catch (error) {
      await unlink(temp).catch(() => undefined);
      throw error;
    }
    return {
      id,
      mimeType,
      sizeBytes: data.length,
      sha256: createHash('sha256').update(data).digest('hex'),
      storagePath,
    };
  }

  async read(file: { id: string; storagePath: string }): Promise<Buffer> {
    let sealed: Buffer;
    try {
      sealed = await readFile(join(this.root, file.storagePath));
    } catch {
      throw new NotFoundException({
        message: 'The file is missing',
        code: ErrorCode.PROOF_FILE_MISSING,
      });
    }
    return this.crypto.decryptBytes(sealed, context(file.id));
  }

  /** Best effort: for files of a proof that was not saved. */
  async remove(storagePath: string): Promise<void> {
    await unlink(join(this.root, storagePath)).catch(() => undefined);
  }
}

const context = (fileId: string) => `payment_proof_files:${fileId}`;
