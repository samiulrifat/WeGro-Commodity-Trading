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

describe('the people list, further', () => {
  const page = (data: object[], totalPages = 1) => ({
    body: {
      data,
      meta: { page: 1, limit: 20, total: data.length, totalPages },
    },
  });

  it('filters by role, status and district, and moves between pages', async () => {
    await signedInAs('admin');
    fakeServer(() => page([person({ id: 'r1' })], 3));
    const { router } = await renderPage(<People />, '/people');
    await screen.findByRole('table');
    const choose = async (filter: string, option: string) => {
      await userEvent.click(screen.getByRole('combobox', { name: filter }));
      await userEvent.click(
        await screen.findByRole('option', { name: option }),
      );
    };
    await choose('Role', 'Investor');
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ role: 'investor' }),
    );
    await choose('Status', 'Verified');
    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        role: 'investor',
        status: 'verified',
      }),
    );
    await choose('District', 'Bogura');
    await choose('Role', 'All Roles');
    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        status: 'verified',
        district: 'BOGURA',
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ page: 2 }),
    );
  });

  it('opens a person from anywhere on the row', async () => {
    await signedInAs('admin');
    fakeServer(() => page([person({ id: 'r1' })]));
    const { router } = await renderPage(<People />, '/people');
    const table = await screen.findByRole('table');
    await userEvent.click(within(table).getByText('Bogura'));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/people/r1'),
    );
    await router.navigate({ to: '/people' });
    await userEvent.click(
      within(await screen.findByRole('table')).getByRole('link'),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/people/r1'),
    );
  });

  it('shows the waiting list without a status filter, and an officer’s own farmers without roles', async () => {
    await signedInAs('admin');
    const sent = fakeServer(() => page([]));
    await renderPage(<PeopleList search={{}} pending />, '/people/pending');
    expect(
      await screen.findByText('Nobody is waiting for verification.'),
    ).toBeTruthy();
    expect(sent[0]!.url.searchParams.get('status')).toBe('pending');
    expect(sent[0]!.url.searchParams.get('manageable')).toBe('true');
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull();
    cleanup();

    await signedInAs('field_officer');
    await renderPage(<PeopleList search={{}} />, '/people');
    expect(
      await screen.findByRole('heading', { name: 'My Farmers' }),
    ).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Role' })).toBeNull();
    expect(
      screen.getAllByRole('link', { name: /Register Farmer/ }).length,
    ).toBeGreaterThan(0);
  });

  it('lets the auditor read but not register, and tries again after an error', async () => {
    await signedInAs('auditor');
    let calls = 0;
    fakeServer(() =>
      ++calls > 1
        ? page([])
        : { status: 500, body: { statusCode: 500, code: 'X', message: 'x' } },
    );
    await renderPage(<People />, '/people');
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('Nobody registered yet.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Register/ })).toBeNull();
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

  const failure = (status: number, code: string) => ({
    status,
    body: { statusCode: status, code, message: code },
  });

  it('lets an admin choose the role, go back, and register in the chosen language', async () => {
    await signedInAs('admin');
    let checks = 0;
    let registers = 0;
    const sent = fakeServer(({ method, url }) => {
      if (method === 'POST' && url.pathname === '/api/participants/check')
        return ++checks === 1
          ? failure(500, 'X')
          : {
              body: {
                data: {
                  outcome: 'passed',
                  phoneTaken: false,
                  nidTaken: false,
                  checks: [],
                },
              },
            };
      if (method === 'POST' && url.pathname === '/api/participants')
        return ++registers === 1
          ? failure(409, 'PHONE_ALREADY_REGISTERED')
          : {
              status: 201,
              body: {
                data: {
                  participant: person({
                    id: 'n1',
                    role: 'investor',
                    fullName: 'Abdul Hamid',
                    chainState: 'submitted',
                  }),
                  temporaryPassword: 'Kp7w-Xq3m-Rt9z',
                  smsSent: true,
                },
              },
            };
      return undefined;
    });
    await renderPage(<RegisterPerson />, '/people/new');
    expect(
      screen.getByText(
        'Choose the role, enter the details as on the NID, and check them before registering.',
      ),
    ).toBeTruthy();
    const next = screen.getByRole('button', { name: 'Next' });
    expect(next.hasAttribute('disabled')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Investor' }));
    expect(
      screen
        .getByRole('button', { name: 'Investor' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    await userEvent.click(next);
    expect(
      screen.getByText(
        'Details of the new Investor, as on their national ID card.',
      ),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Back/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    await fillIn();
    await userEvent.click(screen.getByRole('button', { name: 'English' }));
    const checkDetails = screen.getByRole('button', { name: 'Check Details' });
    await userEvent.click(checkDetails);
    expect(await screen.findByRole('alert')).toBeTruthy();
    await userEvent.click(checkDetails);
    expect(await screen.findByText('Ready to Register')).toBeTruthy();
    expect(sent.at(-1)!.body).toMatchObject({
      role: 'investor',
      language: 'en',
    });

    // Back to the details, still filled in, and checked again.
    await userEvent.click(screen.getByRole('button', { name: /Edit Details/ }));
    expect((screen.getByLabelText('Full Name') as HTMLInputElement).value).toBe(
      'Abdul Hamid',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Check Details' }),
    );
    const register = await screen.findByRole('button', {
      name: 'Register Investor',
    });
    await userEvent.click(register);
    expect(await screen.findByRole('alert')).toBeTruthy();
    await userEvent.click(register);
    expect(
      await screen.findByText('Abdul Hamid is registered as Investor.'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'The ledger is still confirming the registration; it completes on its own.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'View Profile' }).getAttribute('href'),
    ).toBe('/people/n1');

    await userEvent.click(
      screen.getByRole('button', { name: 'Register Another' }),
    );
    expect(
      screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('tells an admin what comes next, and a field officer starts over on the details', async () => {
    await signedInAs('admin');
    fakeServer(({ url }) =>
      url.pathname === '/api/participants/check'
        ? {
            body: {
              data: {
                outcome: 'passed',
                phoneTaken: false,
                nidTaken: false,
                checks: [],
              },
            },
          }
        : {
            status: 201,
            body: {
              data: {
                participant: person({ role: 'buyer', fullName: 'Abdul Hamid' }),
                temporaryPassword: 'Kp7w-Xq3m-Rt9z',
                smsSent: true,
              },
            },
          },
    );
    await renderPage(<RegisterPerson />, '/people/new');
    await userEvent.click(screen.getByRole('button', { name: 'Buyer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await fillIn();
    await userEvent.click(
      screen.getByRole('button', { name: 'Check Details' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Register Buyer' }),
    );
    expect(
      await screen.findByText('Next, verify them from their page.'),
    ).toBeTruthy();
    cleanup();

    await signedInAs('field_officer');
    await renderPage(<RegisterPerson />, '/people/new');
    await fillIn();
    await userEvent.click(
      screen.getByRole('button', { name: 'Check Details' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Register Farmer' }),
    );
    expect(
      await screen.findByText(
        'An admin verifies them next. They are assigned to you.',
      ),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: 'Register Another' }),
    );
    expect((screen.getByLabelText('Full Name') as HTMLInputElement).value).toBe(
      '',
    );
  });

  it('stops when a rule fails, pointing at what failed', async () => {
    await signedInAs('field_officer');
    fakeServer(() => ({
      body: {
        data: {
          outcome: 'failed',
          phoneTaken: false,
          nidTaken: false,
          checks: [
            {
              code: 'AGE',
              result: 'fail',
              reason: 'AGE_UNDER',
              message: 'x',
              params: { min: 18 },
            },
          ],
        },
      },
    }));
    await renderPage(<RegisterPerson />, '/people/new');
    await fillIn();
    await userEvent.click(
      screen.getByRole('button', { name: 'Check Details' }),
    );
    expect(await screen.findByText('Fix what failed below.')).toBeTruthy();
    expect(screen.getByText('Must be at least 18 years old.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Register / })).toBeNull();
  });
});
