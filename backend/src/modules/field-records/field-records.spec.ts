import type { MeasurementDefinition } from '../catalog/entities/field-record-type.entity';
import {
  detectType,
  MalformedImageError,
  stripMetadata,
} from './photo-sanitise';
import {
  normaliseLocation,
  normaliseMeasurements,
  roundCoordinate,
} from './record-values';

// --- Tiny hand-built images ---

const seg = (marker: number, payload: string) => {
  const body = Buffer.from(payload, 'latin1');
  const head = Buffer.alloc(4);
  head[0] = 0xff;
  head[1] = marker;
  head.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([head, body]);
};
const SCAN = Buffer.from([
  0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0x11, 0x22, 0xff, 0x00, 0x33, 0xff, 0xd9,
]);
const jpeg = (...segments: Buffer[]) =>
  Buffer.concat([Buffer.from([0xff, 0xd8]), ...segments, SCAN]);

const chunk = (type: string, data: string) => {
  const body = Buffer.from(data, 'latin1');
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'latin1');
  body.copy(out, 8);
  return out; // CRC left zero: not checked by the stripper
};
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const riffChunk = (type: string, data: Buffer) => {
  const head = Buffer.alloc(8);
  head.write(type, 0, 'latin1');
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([
    head,
    data,
    data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0),
  ]);
};
const webp = (...chunks: Buffer[]) => {
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(4 + body.length, 4);
  header.write('WEBP', 8, 'ascii');
  return Buffer.concat([header, body]);
};

describe('photo type detection', () => {
  it('recognises JPEG, PNG and WebP by content only', () => {
    expect(detectType(jpeg())).toBe('image/jpeg');
    expect(detectType(Buffer.concat([PNG_SIG, chunk('IEND', '')]))).toBe(
      'image/png',
    );
    expect(detectType(webp(riffChunk('VP8 ', Buffer.from('xx'))))).toBe(
      'image/webp',
    );
    expect(detectType(Buffer.from('GIF89a...'))).toBeNull();
    expect(detectType(Buffer.from('<svg/>'))).toBeNull();
    expect(detectType(Buffer.alloc(0))).toBeNull();
  });
});

describe('stripMetadata', () => {
  it('drops Exif, XMP, IPTC and comments from a JPEG, keeping everything else verbatim', () => {
    const jfif = seg(0xe0, 'JFIF\0');
    const icc = seg(0xe2, 'ICC_PROFILE\0colour');
    const quant = seg(0xdb, 'tables');
    const input = jpeg(
      jfif,
      seg(0xe1, 'Exif\0\0GPS 23.81N 90.41E'),
      icc,
      seg(0xed, 'Photoshop 3.0 IPTC'),
      seg(0xfe, 'phone model'),
      quant,
    );
    const out = stripMetadata(input, 'image/jpeg');
    expect(out).toEqual(jpeg(jfif, icc, quant));
    expect(out.toString('latin1')).not.toMatch(/GPS|IPTC|phone/);
    expect(out.subarray(out.length - SCAN.length)).toEqual(SCAN);
  });

  it('drops text, time and Exif chunks from a PNG', () => {
    const ihdr = chunk('IHDR', 'header');
    const idat = chunk('IDAT', 'pixels');
    const input = Buffer.concat([
      PNG_SIG,
      ihdr,
      chunk('tEXt', 'Author\0someone'),
      chunk('eXIf', 'gps'),
      idat,
      chunk('tIME', 'when'),
      chunk('IEND', ''),
    ]);
    expect(stripMetadata(input, 'image/png')).toEqual(
      Buffer.concat([PNG_SIG, ihdr, idat, chunk('IEND', '')]),
    );
  });

  it('drops EXIF and XMP chunks from a WebP, clears their flags and fixes the size', () => {
    const vp8x = Buffer.alloc(10);
    vp8x[0] = 0x08 | 0x04 | 0x10; // EXIF, XMP and alpha flags
    const image = riffChunk('VP8 ', Buffer.from('frame'));
    const input = webp(
      riffChunk('VP8X', vp8x),
      image,
      riffChunk('EXIF', Buffer.from('gps')),
      riffChunk('XMP ', Buffer.from('xml')),
    );
    const out = stripMetadata(input, 'image/webp');
    const clearedFlags = Buffer.from(vp8x);
    clearedFlags[0] = 0x10; // alpha only
    expect(out).toEqual(webp(riffChunk('VP8X', clearedFlags), image));
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
  });

  it('refuses broken files instead of guessing', () => {
    expect(() =>
      stripMetadata(Buffer.from([0xff, 0xd8, 0x00]), 'image/jpeg'),
    ).toThrow(MalformedImageError);
    expect(() =>
      stripMetadata(
        Buffer.concat([
          Buffer.from([0xff, 0xd8]),
          seg(0xe0, 'x').subarray(0, 5),
        ]),
        'image/jpeg',
      ),
    ).toThrow(MalformedImageError);
    expect(() =>
      stripMetadata(Buffer.concat([PNG_SIG, chunk('IHDR', 'h')]), 'image/png'),
    ).toThrow(MalformedImageError);
  });
});

describe('measurements', () => {
  const def = (
    over: Partial<MeasurementDefinition> = {},
  ): MeasurementDefinition => ({
    key: 'plant_height',
    label: 'Plant height',
    labelBn: 'উচ্চতা',
    unit: 'cm',
    min: 0,
    max: 500,
    decimals: 1,
    required: true,
    ...over,
  });

  it('gives every reading one canonical text form', () => {
    for (const input of [12.5, '12.5', '12.50', ' 12.5 ']) {
      expect(normaliseMeasurements({ plant_height: input }, [def()])).toEqual({
        values: { plant_height: '12.5' },
        problems: [],
      });
    }
    expect(normaliseMeasurements({ plant_height: 12 }, [def()]).values).toEqual(
      { plant_height: '12.0' },
    );
    expect(
      normaliseMeasurements({ plant_height: '7' }, [def({ decimals: 0 })])
        .values,
    ).toEqual({
      plant_height: '7',
    });
  });

  it('checks range exactly, including at the bounds', () => {
    expect(
      normaliseMeasurements({ plant_height: '500.0' }, [def()]).problems,
    ).toEqual([]);
    expect(
      normaliseMeasurements({ plant_height: '500.1' }, [def()]).problems,
    ).toHaveLength(1);
    expect(
      normaliseMeasurements({ plant_height: '-0.1' }, [def()]).problems,
    ).toHaveLength(1);
    expect(
      normaliseMeasurements({ t: '-5' }, [
        def({ key: 't', min: -10, max: 0, decimals: 0 }),
      ]).problems,
    ).toEqual([]);
    expect(
      normaliseMeasurements({ t: '-11' }, [
        def({ key: 't', min: -10, max: 0, decimals: 0 }),
      ]).problems,
    ).toHaveLength(1);
  });

  it('rejects extra decimals, non-numbers, unknown keys and missing required readings', () => {
    const r = normaliseMeasurements(
      { plant_height: '12.55', colour: 'green' },
      [def(), def({ key: 'leaves', decimals: 0 })],
    );
    // Each with its code and values, and the label in both languages.
    expect(r.problems).toEqual([
      {
        code: 'MEASUREMENT_UNKNOWN',
        message: 'colour: not a measurement of this record type',
        details: { key: 'colour' },
      },
      {
        code: 'MEASUREMENT_NOT_A_NUMBER',
        message: 'plant_height: must be a number with at most 1 decimal places',
        details: {
          key: 'plant_height',
          label: def().label,
          labelBn: def().labelBn,
          decimals: 1,
        },
      },
      expect.objectContaining({
        code: 'MEASUREMENT_REQUIRED',
        details: expect.objectContaining({ key: 'leaves' }) as object,
      }),
    ]);
    for (const bad of ['1e3', 'NaN', '', '12,5', true, {}]) {
      const out = normaliseMeasurements({ plant_height: bad }, [def()]);
      expect(out.values).toEqual({});
    }
    expect(normaliseMeasurements({}, [def({ required: false })])).toEqual({
      values: {},
      problems: [],
    });
  });
});

describe('location', () => {
  it('canonicalises to 6 places and stays inside Bangladesh', () => {
    expect(normaliseLocation(24.8465, '89.3776')).toEqual({
      latitude: '24.846500',
      longitude: '89.377600',
    });
    expect(normaliseLocation('24.8465123', 89.3)).toEqual({
      problem: {
        code: 'COORDINATES_INVALID',
        message:
          'Coordinates must be decimal degrees with at most 6 decimal places',
      },
    });
    expect(normaliseLocation(51.5, -0.12)).toEqual({
      problem: {
        code: 'LOCATION_OUTSIDE_BANGLADESH',
        message: 'The location is outside Bangladesh',
      },
    });
  });

  it('rounds to about 1 km for those who should not see the exact field', () => {
    expect(roundCoordinate('24.846500')).toBe('24.85');
    expect(roundCoordinate('24.844999')).toBe('24.84');
    expect(roundCoordinate('89.995000')).toBe('90.00');
  });
});
