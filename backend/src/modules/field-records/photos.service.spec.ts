import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  NotFoundException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { config, fakeQueryBuilder, fakeRepo } from '../../../test/support/unit';
import type { Photo } from './entities/photo.entity';
import { MAX_PHOTO_BYTES, PhotosService } from './photos.service';

/** JPEG with an Exif segment the service must strip. */
const jpeg = (label: string) =>
  Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xe1, 0x00, 0x0a]),
    Buffer.from('Exif\0\0GPS', 'latin1').subarray(0, 8),
    Buffer.from([0xff, 0xda, 0x00, 0x04, 0x01, 0x02]),
    Buffer.from(label, 'latin1'),
    Buffer.from([0xff, 0xd9]),
  ]);

describe('PhotosService', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wegro-photos-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const build = (existing: Photo | null = null) => {
    const stored: Photo[] = [];
    const insert = fakeQueryBuilder();
    const photos = fakeRepo({
      findOneBy: jest.fn(({ sha256, id }: { sha256?: string; id?: string }) =>
        Promise.resolve(
          existing ??
            stored.find((p) => p.sha256 === sha256 || p.id === id) ??
            null,
        ),
      ),
      createQueryBuilder: jest.fn(() => insert.qb),
      findOneByOrFail: jest.fn(({ sha256 }: { sha256: string }) => {
        const values = insert.calls.find(([m]) => m === 'values')?.[1] as Photo;
        const row = { ...values, id: 'p1', sha256 };
        stored.push(row);
        return Promise.resolve(row);
      }),
    });
    const service = new PhotosService(
      config({ UPLOAD_DIR: root }),
      photos as never,
    );
    return { service, photos, insert };
  };

  it('stores a cleaned photo under its own hash, and records it once', async () => {
    const { service, insert } = build();
    const photo = await service.store(jpeg('a'), 'u1');
    const file = join(root, photo.storagePath);
    const onDisk = readFileSync(file);
    expect(onDisk.includes(Buffer.from('Exif'))).toBe(false);
    expect(photo.sha256).toBe(
      createHash('sha256').update(onDisk).digest('hex'),
    );
    expect(photo.storagePath).toBe(
      join('photos', photo.sha256.slice(0, 2), `${photo.sha256}.jpg`),
    );
    expect(photo).toMatchObject({ mimeType: 'image/jpeg', uploadedById: 'u1' });
    // A concurrent upload of the same photo must not fail on the unique index.
    expect(insert.calls.map(([m]) => m)).toContain('orIgnore');
    // No temporary files left behind.
    expect(readdirSync(join(root, 'photos', photo.sha256.slice(0, 2)))).toEqual(
      [`${photo.sha256}.jpg`],
    );
  });

  it('hands back the existing record for a photo already stored', async () => {
    const existing = { id: 'old' } as Photo;
    const { service, insert } = build(existing);
    await expect(service.store(jpeg('a'), 'u1')).resolves.toBe(existing);
    expect(insert.calls).toEqual([]);
  });

  it('refuses empty, oversized, unknown and damaged files', async () => {
    const { service } = build();
    await expect(service.store(Buffer.alloc(0), 'u')).rejects.toThrow(
      UnprocessableEntityException,
    );
    await expect(
      service.store(Buffer.alloc(MAX_PHOTO_BYTES + 1, 0xff), 'u'),
    ).rejects.toThrow(UnprocessableEntityException);
    await expect(service.store(Buffer.from('GIF89a....'), 'u')).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
    await expect(
      service.store(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]), 'u'),
    ).rejects.toThrow('The image file is damaged');
  });

  it('hashes the file as it is on disk now, or null when it is gone', async () => {
    const { service } = build();
    const photo = await service.store(jpeg('b'), 'u1');
    await expect(service.hashOnDisk(photo)).resolves.toBe(photo.sha256);
    rmSync(join(root, photo.storagePath));
    await expect(service.hashOnDisk(photo)).resolves.toBeNull();
  });

  it('answers 404 for an unknown photo id', async () => {
    await expect(build().service.find('nope')).rejects.toThrow(
      NotFoundException,
    );
  });
});
