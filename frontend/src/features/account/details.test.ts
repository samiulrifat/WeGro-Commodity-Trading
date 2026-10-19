import { describe, expect, it } from 'vitest';
import {
  DETAIL_FIELDS,
  draftOf,
  localPhone,
  missingFields,
  OPERATOR_FIELDS,
} from '@/features/people/person';
import { requestOf } from './details';

const current = {
  fullName: 'Rahima Begum',
  phone: '+8801712345678',
  nid: '1234567890',
  dateOfBirth: '1990-04-02',
  district: 'BOGURA',
  address: 'Sherpur, Bogura',
};

describe('my details', () => {
  it('writes a number the way people type it, however it came', () => {
    expect(localPhone('+8801712345678')).toBe('01712345678');
    expect(localPhone('880 1712-345678')).toBe('01712345678');
    expect(localPhone('০১৭১২৩৪৫৬৭৮')).toBe('01712345678');
  });

  it('starts the form from the current details', () => {
    expect(draftOf(current)).toEqual({ ...current, phone: '01712345678' });
    expect(
      draftOf({ fullName: 'Super Admin', phone: '+8801711000000' }),
    ).toEqual({
      fullName: 'Super Admin',
      phone: '01711000000',
      nid: '',
      dateOfBirth: '',
      district: '',
      address: '',
    });
  });

  it('asks for every detail, or only a name and number of the super admin', () => {
    const draft = { ...draftOf(current), address: '  ', nid: '' };
    expect(missingFields(draft, DETAIL_FIELDS)).toEqual(['nid', 'address']);
    expect(missingFields(draft, OPERATOR_FIELDS)).toEqual([]);
  });

  it('sends only the details that apply, with the code for a new number', () => {
    const draft = {
      ...draftOf(current),
      fullName: '  Rahima  Begum ',
      nid: '১২৩৪ ৫৬৭ ৮৯০',
    };
    expect(requestOf(draft, DETAIL_FIELDS, undefined)).toEqual({
      ...current,
      fullName: 'Rahima  Begum',
      phone: '01712345678',
    });
    expect(requestOf(draft, OPERATOR_FIELDS, '123456')).toEqual({
      fullName: 'Rahima  Begum',
      phone: '01712345678',
      phoneCode: '123456',
    });
  });
});
