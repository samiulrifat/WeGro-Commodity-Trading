// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationDto } from '@/api/generated/notifications';
import { fakeServer, renderPage, signedInAs } from '@/test/render';
import { NotificationBell } from './bell';
import { InboxPage } from './inbox-page';
import { recordLink } from './record-link';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const user = (role: string, id = 'me') =>
  ({ id, role, status: 'verified' }) as never;

const note = (over: Partial<NotificationDto> = {}): NotificationDto => ({
  id: 9,
  category: 'action',
  kind: 'offer.made',
  title: 'Offer #4 awaiting approval',
  body: null,
  params: { offerId: '4', quantity: '200', unitPrice: '41.00', listingId: '2' },
  subject: { type: 'offer', id: '4' },
  createdAt: new Date().toISOString(),
  readAt: null,
  ...over,
});

describe('where a notification leads', () => {
  it('to the record, where this reader may open it', () => {
    const offer = { kind: 'offer.made', subject: { type: 'offer', id: '4' } };
    expect(recordLink(offer as never, user('admin'))).toBe(
      '/marketplace/deals/4',
    );
    expect(recordLink(offer as never, user('buyer'))).toBe(
      '/marketplace/deals/4',
    );
    // A payee sees their statement; Accounts the round itself.
    const round = { kind: 'payout.paid', subject: { type: 'round', id: '7' } };
    expect(recordLink(round as never, user('farmer'))).toBe('/statement');
    expect(recordLink(round as never, user('accounts'))).toBe(
      '/payouts/rounds/7',
    );
    // Their own registration: their account; an officer's farmer: the person.
    const verified = {
      kind: 'participant.verified',
      subject: { type: 'participant', id: 'me' },
    };
    expect(recordLink(verified as never, user('investor'))).toBe('/account');
    const farmer = {
      kind: 'farmer.verified',
      subject: { type: 'participant', id: 'f1' },
    };
    expect(recordLink(farmer as never, user('field_officer'))).toBe(
      '/people/f1',
    );
    // A bank officer's farmer; the farmer's own record.
    expect(
      recordLink(
        {
          kind: 'consent.bank-granted',
          subject: { type: 'bank-farmer', id: 'f1' },
        } as never,
        user('bank'),
      ),
    ).toBe('/bank/farmers/f1');
    expect(
      recordLink(
        {
          kind: 'track-record.published',
          subject: { type: 'track-record', id: 'me' },
        } as never,
        user('farmer'),
      ),
    ).toBe('/track-records');
    // Nowhere this reader may go: no link at all.
    expect(recordLink(round as never, user('supplier'))).toBeNull();
    expect(
      recordLink(
        { kind: 'system.indexer-behind', subject: null } as never,
        user('super_admin'),
      ),
    ).toBe('/system');
  });
});

describe('inbox', () => {
  it('words each in the reader’s language, links it and marks it read on opening', async () => {
    await signedInAs('admin');
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === '/api/notifications')
        return {
          body: {
            data: {
              items: [
                note(),
                note({
                  id: 8,
                  category: 'outcome',
                  kind: 'project.fully-funded',
                  title: 'Maize is fully funded',
                  params: { project: 'Maize in Bogura #2' },
                  subject: { type: 'project', id: 'p1' },
                  readAt: '2026-10-26T00:00:00.000Z',
                }),
              ],
              nextBefore: 8,
            },
          },
        };
      if (url.pathname === '/api/notifications/unread-count')
        return { body: { data: { unread: 1 } } };
      if (method === 'POST' && url.pathname === '/api/notifications/9/read')
        return { body: { data: note({ readAt: new Date().toISOString() }) } };
      return undefined;
    });
    await renderPage(<InboxPage />, '/notifications');
    const offer = await screen.findByRole('link', {
      name: /Offer #4 awaiting approval/,
    });
    expect(offer.getAttribute('href')).toBe('/marketplace/deals/4');
    expect(screen.getByText('Needs Your Action')).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: /Maize in Bogura #2 is fully funded/ })
        .getAttribute('href'),
    ).toBe('/projects/p1');
    expect(screen.getByRole('tab', { name: 'Unread (1)' })).toBeTruthy();

    await userEvent.click(offer);
    await waitFor(() =>
      expect(
        sent.some(
          (s) =>
            s.method === 'POST' &&
            s.url.pathname === '/api/notifications/9/read',
        ),
      ).toBe(true),
    );
  });

  it('loads older ones on asking, shows only unread on that tab, and marks all read', async () => {
    await signedInAs('accounts');
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === '/api/notifications') {
        const before = url.searchParams.get('before');
        return {
          body: {
            data: before
              ? {
                  items: [
                    note({ id: 3, params: { ...note().params, offerId: '3' } }),
                  ],
                  nextBefore: null,
                }
              : { items: [note()], nextBefore: 9 },
          },
        };
      }
      if (url.pathname === '/api/notifications/unread-count')
        return { body: { data: { unread: 2 } } };
      if (method === 'POST' && url.pathname === '/api/notifications/read-all')
        return { body: { data: { marked: 2 } } };
      return undefined;
    });
    await renderPage(<InboxPage />, '/notifications');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Show Older' }),
    );
    expect(await screen.findByText('Offer #3 awaiting approval')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show Older' })).toBeNull();

    await userEvent.click(screen.getByRole('tab', { name: 'Unread (2)' }));
    await waitFor(() =>
      expect(
        sent.some(
          (s) =>
            s.url.pathname === '/api/notifications' &&
            s.url.searchParams.get('unread') === 'true',
        ),
      ).toBe(true),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Mark All Read' }),
    );
    await waitFor(() =>
      expect(
        sent.some((s) => s.url.pathname === '/api/notifications/read-all'),
      ).toBe(true),
    );
  });
});

describe('bell', () => {
  it('shows how many are unread', async () => {
    await signedInAs('farmer');
    fakeServer(({ url }) =>
      url.pathname === '/api/notifications/unread-count'
        ? { body: { data: { unread: 120 } } }
        : undefined,
    );
    await renderPage(<NotificationBell />, '/');
    expect(
      await screen.findByRole('link', { name: 'Notifications: 120 unread' }),
    ).toBeTruthy();
    expect(screen.getByText('99+')).toBeTruthy();
  });
});
