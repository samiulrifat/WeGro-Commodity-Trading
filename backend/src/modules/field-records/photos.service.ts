import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { Repository } from 'typeorm';
import type { EnvironmentVariables } from '../../config/env.validation';
import { Photo } from './entities/photo.entity';
import {
  detectType,
  EXTENSIONS,
  MalformedImageError,
  stripMetadata,
} from './photo-sanitise';

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** The ledger's photoHash: the SHA-256 of the stored file, as bytes32. */
export const photoHash = (sha256: string) => `0x${sha256}`;

/**
 * Field photos in a local folder, named by content:
 * UPLOAD_DIR/photos/ab/abcdef….jpg. Uploads are type-checked by content,
 * stripped of metadata, then hashed; the same photo uploaded twice is stored
 * once. Files are written to a temporary name and renamed into place, so a
 * crash never leaves a half-written photo under its final name.
 */
@Injectable()
export class PhotosService {
  private readonly root: string;

  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    @InjectRepository(Photo) private readonly photos: Repository<Photo>,
  ) {
    this.root = resolve(config.get('UPLOAD_DIR', { infer: true }));
  }

  async store(data: Buffer, uploadedById: string): Promise<Photo> {
    if (data.length === 0 || data.length > MAX_PHOTO_BYTES) {
      throw new UnprocessableEntityException('A photo must be 1 byte to 10 MB');
    }
    const type = detectType(data);
    if (!type)
      throw new UnsupportedMediaTypeException(
        'Photos must be JPEG, PNG or WebP',
      );
    let clean: Buffer;
    try {
      clean = stripMetadata(data, type);
    } catch (error) {
      if (error instanceof MalformedImageError) {
        throw new UnprocessableEntityException('The image file is damaged');
      }
      throw error;
    }
    const sha256 = createHash('sha256').update(clean).digest('hex');

    const existing = await this.photos.findOneBy({ sha256 });
    if (existing) return existing;

    const storagePath = join(
      'photos',
      sha256.slice(0, 2),
      `${sha256}.${EXTENSIONS[type]}`,
    );
    const target = join(this.root, storagePath);
    if (!(await exists(target))) {
      await mkdir(dirname(target), { recursive: true });
      const temp = `${target}.${randomUUID()}.tmp`;
      await writeFile(temp, clean, { flag: 'wx' });
      try {
        await rename(temp, target);
      } catch (error) {
        await unlink(temp).catch(() => undefined);
        throw error;
      }
    }
    // Two uploads of the same photo at once: the unique index picks one row.
    await this.photos
      .createQueryBuilder()
      .insert()
      .values({
        sha256,
        mimeType: type,
        sizeBytes: clean.length,
        storagePath,
        uploadedById,
      })
      .orIgnore()
      .execute();
    return this.photos.findOneByOrFail({ sha256 });
  }

  async find(id: string): Promise<Photo> {
    const photo = await this.photos.findOneBy({ id });
    if (!photo) throw new NotFoundException('Photo not found');
    return photo;
  }

  /** Streams the photo as the response; 404 if its file is missing. */
  async send(photo: Photo, res: Response): Promise<void> {
    const stream = createReadStream(join(this.root, photo.storagePath));
    await new Promise<void>((resolve, reject) => {
      stream.once('open', () => {
        res.setHeader('Content-Type', photo.mimeType);
        res.setHeader('Content-Length', String(photo.sizeBytes));
        // Content-addressed: the bytes behind an id never change.
        res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
        stream.pipe(res);
        stream.once('end', resolve);
      });
      stream.once('error', () =>
        reject(new NotFoundException('The photo file is missing')),
      );
    });
  }

  /** SHA-256 of the file as it is on disk now: what Verify compares with the ledger. */
  async hashOnDisk(photo: Photo): Promise<string | null> {
    try {
      const data = await readFile(join(this.root, photo.storagePath));
      return createHash('sha256').update(data).digest('hex');
    } catch {
      return null;
    }
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
