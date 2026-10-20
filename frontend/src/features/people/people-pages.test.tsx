// @vitest-environment jsdom
import { useSearch } from '@tanstack/react-router';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeServer, renderPage, signedInAs } from '@/test/render';
import { PeopleList } from './people-list';
import { parsePeopleSearch } from './people-search';
import { RegisterPerson } from './register-person';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const person = (over: object) => ({
  id: crypto.randomUUID(),
  role: 'farmer',
  status: 'pending',
  chainState: 'confirmed',
  fullName: 'Rahima Begum',
  phone: '+88017•••••678',
  district: 'BOGURA',
  fieldOfficerId: null,
  idCheckOutcome: 'passed',
  createdAt: '2026-10-18T04:00:00.000Z',
  ...over,
});

function People() {
  const search = parsePeopleSearch(useSearch({ strict: false }));
  return <PeopleList search={search} />;
}

describe('the people list', () => {
  it('shows each person with where they stand, and searches on the server', async () => {
    await signedInAs('admin');
    const sent = fakeServer(({ url }) =>
      url.pathname === '/api/participants'
        ? {
            body: {
              data: url.searchParams.get('q')
                ? [person({ fullName: 'Karim Mia', status: 'verified' })]
                : [
                    person({ idCheckOutcome: 'flagged' }),
                    person({
                      fullName: 'Karim Mia',
                      status: 'verified',
                      chainState: 'submitted',
                    }),
                  ],
              meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
            },
          }
        : undefined,
    );
    await renderPage(<People />, '/people');

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByText('Rahima Begum')).toBeTruthy();
    expect(within(rows[1]!).getByText('Pending')).toBeTruthy();
    expect(within(rows[1]!).getByText('Flagged')).toBeTruthy();
    expect(within(rows[2]!).getByText('Awaiting Ledger')).toBeTruthy();

    const box = screen.getByRole('searchbox', {
      name: 'Name, mobile number or NID',
    });
    await userEvent.type(box, 'karim');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    await waitFor(() =>
      expect(sent.at(-1)!.url.searchParams.get('q')).toBe('karim'),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole('table')).getAllByRole('row'),
      ).toHaveLength(2),
    );
  });

  it('says plainly when the search finds nobody', async () => {
    await signedInAs('admin');
    fakeServer(() => ({
      body: { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } },
    }));
    await renderPage(<People />, '/people?q=nobody');
    expect(await screen.findByText('No Matching People')).toBeTruthy();
  });
});

describe('registering a farmer', () => {
  const fillIn = async () => {
    await userEvent.type(screen.getByLabelText('Full Name'), 'Abdul Hamid');
    await userEvent.type(screen.getByLabelText('Mobile Number'), '01712345678');
    await userEvent.type(screen.getByLabelText('NID Number'), '2612345678901');
    await userEvent.type(screen.getByLabelText('Date of Birth'), '1985-02-03');
    await userEvent.type(screen.getByLabelText('Address'), 'Village 1, Bogura');
    await userEvent.click(screen.getByRole('combobox', { name: 'District' }));
    await userEvent.click(
      await screen.findByRole('option', { name: 'Bogura' }),
    );
  };

  it('asks for every detail before checking anything', async () => {
    await signedInAs('field_officer');
    const sent = fakeServer(() => undefined);
    await renderPage(<RegisterPerson />, '/people/new');
    await userEvent.click(
      screen.getByRole('button', { name: 'Check Details' }),
    );
    expect(screen.getAllByText('Fill this in.')).toHaveLength(6);
    expect(sent).toHaveLength(0);
  });

  it('checks first, shows the warnings, then registers and hands over the password', async () => {
    await signedInAs('field_officer');
    const sent = fakeServer(({ method, url }) => {
      if (method === 'POST' && url.pathname === '/api/participants/check') {
        return {
          body: {
            data: {
              outcome: 'flagged',
              phoneTaken: false,
              nidTaken: false,
              checks: [
                {
                  code: 'NID_DISTRICT',
                  result: 'warn',
                  reason: 'NID_DISTRICT_DIFFERENT',
                  message: 'x',
                  params: { issued: 'DHAKA', given: 'BOGURA' },
                },
              ],
            },
          },
        };
      }
      if (method === 'POST' && url.pathname === '/api/participants') {
        return {
          status: 201,
          body: {
            data: {
              participant: person({ fullName: 'Abdul Hamid' }),
              temporaryPassword: 'Kp7w-Xq3m-Rt9z',
              smsSent: false,
            },
          },
        };
      }
      return undefined;
    });
    await renderPage(<RegisterPerson />, '/people/new');
    // A field officer registers farmers only: no role to choose.
    expect(screen.queryByText('Role', { selector: 'legend' })).toBeNull();
    await fillIn();
    await userEvent.click(
      screen.getByRole('button', { name: 'Check Details' }),
    );

    expect(
      await screen.findByText('Can Be Registered with Warnings'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Issued in Dhaka, not Bogura. This happens when someone lives away from home.',
      ),
    ).toBeTruthy();
    expect(sent[0]!.body).toMatchObject({
      role: 'farmer',
      phone: '01712345678',
      nid: '2612345678901',
      district: 'BOGURA',
      language: 'bn',
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'Register Farmer' }),
    );
    expect(await screen.findByText('Kp7w-Xq3m-Rt9z')).toBeTruthy();
    expect(screen.getByText('SMS Not Sent')).toBeTruthy();
    expect(screen.getByText('Give them this password in person.')).toBeTruthy();
  });

  it('stops at taken details, saying which', async () => {
    await signedInAs('field_officer');
    fakeServer(() => ({
      body: {
        data: {
          outcome: 'passed',
          phoneTaken: true,
          nidTaken: false,
          checks: [],
        },
      },
    }));
    await renderPage(<RegisterPerson />, '/people/new');
    await fillIn();
    await userEvent.click(
      screen.getByRole('button', { name: 'Check Details' }),
    );
    expect(await screen.findByText('Cannot Be Registered')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Register / })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Fix Details/ }));
    expect(
      screen.getByText('This phone number is already registered.'),
    ).toBeTruthy();
  });
});
