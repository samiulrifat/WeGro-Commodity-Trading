// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ParticipantDetailDto } from '@/api/generated/participants';
import { fakeServer, renderPage, signedInAs } from '@/test/render';
import { PersonActions } from './person-actions';
import { PersonStatus } from './person-status';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const officer = (over: Partial<ParticipantDetailDto> = {}) =>
  ({
    id: '11111111-1111-4111-8111-111111111111',
    role: 'field_officer',
    status: 'verified',
    chainState: 'confirmed',
    fullName: 'Imran Hossain',
    phone: '01712345678',
    district: 'BOGURA',
    fieldOfficerId: null,
    idCheckOutcome: 'passed',
    accessRevoked: false,
    revocation: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    masked: false,
    account: '0x1',
    nid: null,
    dateOfBirth: null,
    address: null,
    statusReason: null,
    statusChangedAt: null,
    registeredById: null,
    registeredBy: null,
    selfRegistered: false,
    fieldOfficer: null,
    email: null,
    registrationTx: null,
    idCheck: null,
    ...over,
  }) as ParticipantDetailDto;

describe('revoking access', () => {
  it('asks why, shows open work, and hands a field officer’s farmers over', async () => {
    await signedInAs('super_admin');
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname.endsWith('/open-work')) {
        return {
          body: {
            data: {
              items: [
                { kind: 'farmers_assigned', count: 2 },
                { kind: 'claims_open', count: 1 },
              ],
              farmersToMove: 2,
            },
          },
        };
      }
      if (url.pathname === '/api/participants') {
        return {
          body: {
            data: [
              officer(),
              officer({
                id: '22222222-2222-4222-8222-222222222222',
                fullName: 'Sumon Ahmed',
              }),
            ],
            meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
          },
        };
      }
      if (method === 'POST' && url.pathname.endsWith('/revoke')) {
        return {
          body: { data: officer({ status: 'rejected', accessRevoked: true }) },
        };
      }
      return undefined;
    });
    await renderPage(
      <PersonActions person={officer()} viewer="super_admin" />,
      '/people/x',
    );
    // A verified person is not rejected: their access is revoked.
    expect(screen.queryByRole('button', { name: /^Reject/ })).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: /Revoke Access/ }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText('2 farmers they look after'),
    ).toBeTruthy();
    expect(
      within(dialog).getByText('1 insurance claim they opened, not decided'),
    ).toBeTruthy();
    // Staff reasons only.
    expect(
      within(dialog).getByRole('radio', { name: 'Resigned' }),
    ).toBeTruthy();
    expect(
      within(dialog).queryByRole('radio', { name: 'Left the Platform' }),
    ).toBeNull();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Revoke Access' }),
    );
    expect(within(dialog).getByText('Choose one.')).toBeTruthy();
    expect(
      within(dialog).getByText('Choose the field officer who takes over.'),
    ).toBeTruthy();
    expect(sent.some((s) => s.method === 'POST')).toBe(false);

    await userEvent.click(within(dialog).getByRole('radio', { name: 'Other' }));
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Revoke Access' }),
    );
    expect(
      within(dialog).getByText('Write why the access is revoked.'),
    ).toBeTruthy();
    await userEvent.type(
      within(dialog).getByLabelText('Note'),
      'Moved to head office',
    );
    // The leaving officer is not offered as their own replacement.
    expect(
      within(dialog).queryByRole('button', { name: /Imran Hossain/ }),
    ).toBeNull();
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Sumon Ahmed/ }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Revoke Access' }),
    );
    await waitFor(() =>
      expect(sent.find((s) => s.method === 'POST')?.body).toEqual({
        reason: 'other',
        note: 'Moved to head office',
        replacementOfficerId: '22222222-2222-4222-8222-222222222222',
      }),
    );
  });

  it('offers restoring revoked access, and says it is revoked', async () => {
    await signedInAs('admin');
    fakeServer(() => undefined);
    const revoked = officer({
      role: 'investor',
      status: 'rejected',
      accessRevoked: true,
    });
    await renderPage(
      <>
        <PersonStatus person={revoked} />
        <PersonActions person={revoked} viewer="admin" />
      </>,
      '/people/x',
    );
    expect(screen.getByText('Access Revoked')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Restore Access/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Revoke Access/ })).toBeNull();
  });
});
