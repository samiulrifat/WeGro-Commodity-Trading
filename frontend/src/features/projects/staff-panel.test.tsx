// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@/app/navigation';
import { project } from '@/test/fixtures';
import { fakeServer, type Reply, renderPage, signedInAs } from '@/test/render';
import { StaffPanel, Timeline } from './staff-panel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// A lazy query's answer, on a machine busy with other test files.
const slow = { timeout: 5_000 };

const refused = {
  status: 409,
  body: { statusCode: 409, code: 'PROJECT_STAGE_INVALID', message: 'Not now' },
};

async function panel(
  role: Role,
  p = project(),
  answer: Parameters<typeof fakeServer>[0] = () => ({ body: { data: [] } }),
) {
  await signedInAs(role);
  const sent = fakeServer(answer);
  const view = await renderPage(
    <StaffPanel project={p} />,
    `/projects/${p.id}`,
  );
  return { sent, ...view };
}

describe('the staff panel', () => {
  it('lets an admin edit, publish and delete a draft', async () => {
    const draft = project({ stage: 'draft', chainState: 'local' });
    const { sent, router } = await panel('admin', draft, ({ method }) =>
      method === 'GET' ? { body: { data: [] } } : { body: { data: draft } },
    );
    expect(
      screen.getByRole('link', { name: /Edit Draft/ }).getAttribute('href'),
    ).toBe('/projects/p1/edit');
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Publish',
      }),
    );
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      sent.some(
        (r) =>
          r.method === 'POST' && r.url.pathname === '/api/projects/p1/publish',
      ),
    ).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Delete Draft' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Delete Draft',
      }),
    );
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/projects/drafts'),
    );
    expect(
      sent.some(
        (r) => r.method === 'DELETE' && r.url.pathname === '/api/projects/p1',
      ),
    ).toBe(true);
  });

  it('offers the moves of each stage, and sends each one', async () => {
    const cases = [
      ['funded', 'Mark Active', 'activate'],
      ['funded', 'Cancel Project', 'cancel'],
      ['active', 'Mark Ready for Sale', 'ready-for-sale'],
      ['paid_out', 'Close Project', 'close'],
      ['open_for_funding', 'Cancel Project', 'cancel'],
    ] as const;
    for (const [stage, label, path] of cases) {
      const p = project({ stage });
      const { sent, unmount } = await panel('admin', p, ({ method }) =>
        method === 'GET' ? { body: { data: [] } } : { body: { data: p } },
      );
      await userEvent.click(screen.getByRole('button', { name: label }));
      await userEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', {
          name: label,
        }),
      );
      await vi.waitFor(() =>
        expect(
          sent.some(
            (r) =>
              r.method === 'POST' &&
              r.url.pathname === `/api/projects/p1/${path}`,
          ),
        ).toBe(true),
      );
      unmount();
    }
  });

  it('keeps the dialog open with the reason when the ledger refuses, and closes on Cancel', async () => {
    await panel('admin', project({ stage: 'funded' }), ({ method }) =>
      method === 'GET' ? { body: { data: [] } } : refused,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Mark Active' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Mark Active' }),
    );
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows no moves when the stage has none', async () => {
    await panel('admin', project({ stage: 'ready_for_sale' }));
    expect(screen.queryByText('Manage Project')).toBeNull();
  });

  it('checks the terms against the ledger: matching, differing, or not reachable', async () => {
    let answer: Reply = { body: { data: { matches: true, mismatches: [] } } };
    await panel('auditor', project(), ({ url }) =>
      url.pathname.endsWith('/integrity') ? answer : { body: { data: [] } },
    );
    expect(screen.queryByText('Manage Project')).toBeNull();
    const check = screen.getByRole('button', { name: 'Verify Against Ledger' });
    await userEvent.click(check);
    expect(
      await screen.findByText('The terms match the ledger.', {}, slow),
    ).toBeTruthy();
    answer = { body: { data: { matches: false, mismatches: ['slotPrice'] } } };
    await userEvent.click(check);
    expect(
      await screen.findByText('The terms do not match the ledger', {}, slow),
    ).toBeTruthy();
    answer = {
      status: 503,
      body: {
        statusCode: 503,
        code: 'CHAIN_UNAVAILABLE',
        message: 'Ledger down',
      },
    };
    await userEvent.click(check);
    expect(await screen.findByText('Ledger down', {}, slow)).toBeTruthy();
    // The earlier answer goes: it is not what the last check found.
    expect(screen.queryByText('The terms do not match the ledger')).toBeNull();
  });

  it('lists who holds units, linking to each person', async () => {
    await panel('accounts', project(), ({ url }) =>
      url.pathname.endsWith('/holders')
        ? {
            body: {
              data: [
                {
                  investor: { id: 'i1', fullName: 'Shirin Akter' },
                  slots: 2,
                  amount: '40000.00',
                },
              ],
            },
          }
        : undefined,
    );
    expect(
      (await screen.findByRole('link', { name: 'Shirin Akter' })).getAttribute(
        'href',
      ),
    ).toBe('/people/i1');
    expect(screen.getByText(/2 units/)).toBeTruthy();
  });

  it('says when no one holds units yet, and shows nothing for a project not on the ledger', async () => {
    await panel('accounts');
    expect(await screen.findByText('No units are held yet.')).toBeTruthy();
    cleanup();
    await panel('accounts', project({ chainState: 'local' }));
    expect(screen.queryByText('Investors Holding Units')).toBeNull();
  });
});

describe('the timeline', () => {
  it('lists what happened on the ledger, oldest first', async () => {
    await signedInAs('investor');
    fakeServer(() => ({
      body: {
        data: [
          { kind: 'created', at: '2026-10-01T00:00:00Z', txHash: '0x1' },
          {
            kind: 'stage_changed',
            stage: 'funded',
            at: '2026-10-05T00:00:00Z',
            txHash: '0x2',
          },
        ],
      },
    }));
    await renderPage(<Timeline project={project()} />, '/projects/p1');
    expect(await screen.findByText('Created on the ledger')).toBeTruthy();
    expect(screen.getByText('Stage: Funded')).toBeTruthy();
  });

  it('says when nothing is on the ledger yet, and is absent for a local draft', async () => {
    await signedInAs('investor');
    fakeServer(() => ({ body: { data: [] } }));
    await renderPage(<Timeline project={project()} />, '/projects/p1');
    expect(await screen.findByText('Nothing on the ledger yet.')).toBeTruthy();
    cleanup();
    await renderPage(
      <Timeline project={project({ chainState: 'local' })} />,
      '/projects/p1',
    );
    expect(screen.queryByText('Timeline')).toBeNull();
  });

  it('closes a move on Escape', async () => {
    await panel('admin', project({ stage: 'funded' }), ({ method }) =>
      method === 'GET' ? { body: { data: [] } } : refused,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Mark Active' }));
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
