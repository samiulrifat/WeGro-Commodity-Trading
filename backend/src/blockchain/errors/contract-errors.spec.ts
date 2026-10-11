import { HttpStatus } from '@nestjs/common';
import { AbiCoder, concat, id } from 'ethers';
import { CONTRACT_NAMES, FACTORIES } from '../contracts.registry';
import {
  CONTRACT_ERROR_STATUS,
  ContractErrorDecoder,
  ContractRevertException,
  findRevertData,
  humanise,
} from './contract-errors';

const interfaces = CONTRACT_NAMES.map((n) => FACTORIES[n].createInterface());
const decoder = new ContractErrorDecoder(interfaces);
const coder = AbiCoder.defaultAbiCoder();

function revertData(signature: string, types: string[], values: unknown[]) {
  return concat([id(signature).slice(0, 10), coder.encode(types, values)]);
}

describe('CONTRACT_ERROR_STATUS', () => {
  const abiErrors = new Set<string>();
  for (const iface of interfaces) {
    iface.forEachError((f) => abiErrors.add(f.name));
  }

  it('has a status for every custom error in the contract ABIs', () => {
    const missing = [...abiErrors].filter((n) => !(n in CONTRACT_ERROR_STATUS));
    expect(missing).toEqual([]);
  });

  it('has no entries for errors the contracts no longer define', () => {
    const stale = Object.keys(CONTRACT_ERROR_STATUS).filter(
      (n) => !abiErrors.has(n),
    );
    expect(stale).toEqual([]);
  });

  it('never maps two ABI errors with one name to different signatures', () => {
    const signatures = new Map<string, string>();
    for (const iface of interfaces) {
      iface.forEachError((f) => {
        const sig = f.format('sighash');
        expect(signatures.get(f.name) ?? sig).toBe(sig);
        signatures.set(f.name, sig);
      });
    }
  });
});

describe('ContractErrorDecoder', () => {
  const participant = '0x' + 'ab'.repeat(32);

  it('decodes a custom error with its arguments', () => {
    const data = revertData(
      'ParticipantAlreadyRegistered(bytes32)',
      ['bytes32'],
      [participant],
    );
    expect(decoder.decode(data)).toEqual({
      name: 'ParticipantAlreadyRegistered',
      args: { participantId: participant },
    });
  });

  it('decodes Error(string) and Panic(uint256)', () => {
    expect(
      decoder.decode(revertData('Error(string)', ['string'], ['nope'])),
    ).toEqual({ name: 'Error', args: { reason: 'nope' } });
    expect(
      decoder.decode(revertData('Panic(uint256)', ['uint256'], [0x11n])),
    ).toEqual({ name: 'Panic', args: { code: '17' } });
  });

  it('still names the error when its arguments are malformed', () => {
    const selector = id('ParticipantAlreadyRegistered(bytes32)').slice(0, 10);
    expect(decoder.decode(selector + '00')).toEqual({
      name: 'ParticipantAlreadyRegistered',
      args: {},
    });
  });

  it('returns null for unknown or junk data', () => {
    expect(decoder.decode('0xdeadbeef')).toBeNull();
    expect(decoder.decode('0x12')).toBeNull();
    expect(decoder.decode('not hex')).toBeNull();
  });

  it('turns a nested ethers error into a 409 with code and details', () => {
    const data = revertData(
      'ParticipantAlreadyRegistered(bytes32)',
      ['bytes32'],
      [participant],
    );
    const thrown = { code: 'CALL_EXCEPTION', info: { error: { data } } };
    const http = decoder.toHttpException(thrown);
    expect(http).toBeInstanceOf(ContractRevertException);
    expect(http.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(http.getResponse()).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'Participant already registered',
      code: 'ParticipantAlreadyRegistered',
      details: { participantId: participant },
    });
  });

  it('answers 503 when the node is unreachable and 500 otherwise', () => {
    expect(decoder.toHttpException({ code: 'ECONNREFUSED' }).getStatus()).toBe(
      503,
    );
    expect(
      decoder.toHttpException(new Error('something odd')).getStatus(),
    ).toBe(500);
  });

  it('knows every error from every contract interface', () => {
    const names = new Set(decoder.errorNames());
    for (const name of Object.keys(CONTRACT_ERROR_STATUS)) {
      expect(names.has(name)).toBe(true);
    }
  });
});

describe('helpers', () => {
  it('finds revert data at any supported depth, and ignores short data', () => {
    const data = '0x12345678' + '00'.repeat(32);
    expect(findRevertData({ cause: { revert: { data } } })).toBe(data);
    expect(findRevertData({ data: '0x' })).toBeNull();
    expect(findRevertData(null)).toBeNull();
  });

  it('humanises error names', () => {
    expect(humanise('ParticipantAlreadyRegistered')).toBe(
      'Participant already registered',
    );
  });
});
