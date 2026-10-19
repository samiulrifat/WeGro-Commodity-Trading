import { nameWords, NameIndexService } from './name-index.service';
import { PersonSearch } from './person-search';

describe('name words', () => {
  it('splits at anything that is not a letter, mark or digit, once each', () => {
    expect(nameWords('  Md. Rahim-Uddin  ')).toEqual(['md', 'rahim', 'uddin']);
    expect(nameWords("O'Neil  o'neil")).toEqual(['o', 'neil']);
    expect(nameWords('RAHIM rahim')).toEqual(['rahim']);
  });

  it('keeps Bengali vowel signs inside their words', () => {
    expect(nameWords('মোঃ রহিম উদ্দিন')).toEqual(['মোঃ', 'রহিম', 'উদ্দিন']);
  });

  it('matches however the name was composed', () => {
    // "e" plus a combining accent and the single accented letter.
    expect(nameWords('José')).toEqual(nameWords('José'));
  });
});

describe('person search', () => {
  const crypto = { blindIndex: (kind: string, v: string) => `${kind}:${v}` };
  const codec = {
    phoneIndex: (p: string) => `phone:${p}`,
    nidIndex: (n: string) => `nid:${n}`,
  };
  const search = new PersonSearch(
    codec as never,
    new NameIndexService(crypto as never, codec as never, {} as never),
  );
  const qb = () => {
    const calls: Array<[string, object | undefined]> = [];
    const builder = {
      andWhere: (sql: string, params?: object) => {
        calls.push([sql, params]);
        return builder;
      },
    };
    return { builder, calls };
  };

  it('reads a mobile number, an NID or words of a name', () => {
    const phone = qb();
    search.apply(phone.builder as never, 'u.id', '০১৭১২-৩৪৫৬৭৮');
    expect(phone.calls[0]![1]).toEqual({ searchPhone: 'phone:+8801712345678' });

    const nid = qb();
    search.apply(nid.builder as never, 'u.id', '1990 1012 3456 78901');
    expect(nid.calls[0]![1]).toEqual({ searchNid: 'nid:19901012345678901' });

    const name = qb();
    search.apply(name.builder as never, 'u.id', 'Rahim  UDDIN');
    expect(name.calls[0]![1]).toEqual({
      searchWords: ['name:rahim', 'name:uddin'],
      searchWordCount: 2,
    });
  });

  it('leaves the list alone with nothing typed, and finds nobody from punctuation', () => {
    const empty = qb();
    search.apply(empty.builder as never, 'u.id', '   ');
    expect(empty.calls).toEqual([]);
    const marks = qb();
    search.apply(marks.builder as never, 'u.id', '.-');
    expect(marks.calls[0]![0]).toBe('1 = 0');
  });
});
