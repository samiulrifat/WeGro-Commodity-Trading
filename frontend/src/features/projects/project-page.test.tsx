// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectDto } from '@/api/generated/projects';
import { project } from '@/test/fixtures';
import { fakeServer, renderPage, signedInAs } from '@/test/render';
import { ProjectPage } from './project-page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const empty = { body: { data: [], meta: { total: 0, page: 1, limit: 20 } } };

/** The project, and nothing in the side panels unless a test answers more. */
function serve(
  p: ProjectDto,
  more: Parameters<typeof fakeServer>[0] = () => undefined,
) {
  return fakeServer((sent) => {
    if (sent.url.pathname === `/api/projects/${p.id}`)
      return { body: { data: p } };
    if (sent.url.pathname === '/api/field-records') return empty;
    return more(sent);
  });
}

describe('the project page', () => {
  it('shows an investor the terms, a simulator and a way to book', async () => {
    await signedInAs('investor');
    const p = project({
      description: 'Maize on high ground, sold to the feed mill.',
      insured: true,
      payoutIntervalMonths: 2,
      plannedStartDate: '2026-11-15',
    });
    const sent = serve(p, ({ method, url }) =>
      method === 'POST' && url.pathname === `/api/projects/${p.id}/reservations`
        ? { status: 201, body: { data: { id: 77 } } }
        : undefined,
    );
    const { router } = await renderPage(
      <ProjectPage id={p.id} />,
      `/projects/${p.id}`,
    );

    expect(await screen.findByRole('heading', { name: p.title })).toBeTruthy();
    expect(screen.getByText('Why This Project')).toBeTruthy();
    expect(screen.getByText(p.description!)).toBeTruthy();
    for (const tag of ['Variable Return', 'Insured'])
      expect(screen.getByText(tag)).toBeTruthy();
    expect(screen.getByText('Every 2 Months')).toBeTruthy();
    expect(screen.getByText('Planned Start')).toBeTruthy();
    expect(screen.getByText('3 units left')).toBeTruthy();
    expect(screen.getByText('2 people investing today')).toBeTruthy();

    // The simulator counts between one unit and what is free.
    const sim = screen
      .getByText('Simulate Returns')
      .closest('[data-slot="card"]') as HTMLElement;
    const fewer = within(sim).getByRole('button', { name: 'One Unit Fewer' });
    const more = within(sim).getByRole('button', { name: 'One Unit More' });
    expect(fewer).toHaveProperty('disabled', true);
    await userEvent.click(more);
    await userEvent.click(more);
    expect(more).toHaveProperty('disabled', true);
    expect(within(sim).getByText('Max 3')).toBeTruthy();
    await userEvent.click(fewer);
    expect(more).toHaveProperty('disabled', false);
    await userEvent.click(more);

    // Called off on Escape, then booked.
    await userEvent.click(screen.getByRole('button', { name: 'Invest Now' }));
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Booking two units opens the booking.
    await userEvent.click(screen.getByRole('button', { name: 'Invest Now' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'One Unit More' }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Book Units' }),
    );
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/holdings/bookings/77'),
    );
    expect(sent.find((r) => r.method === 'POST')!.body).toEqual({ slots: 2 });
  });

  it('keeps the booking dialog open with the reason when the booking is refused', async () => {
    await signedInAs('investor');
    const p = project();
    serve(p, ({ method }) =>
      method === 'POST'
        ? {
            status: 409,
            body: {
              statusCode: 409,
              code: 'NOT_ENOUGH_SLOTS',
              message: 'Only 1 slot is available',
            },
          }
        : undefined,
    );
    await renderPage(<ProjectPage id={p.id} />, `/projects/${p.id}`);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Invest Now' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Book Units' }),
    );
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('gives staff no booking bar, and a funded project no simulator', async () => {
    await signedInAs('admin');
    const p = project({
      stage: 'funded',
      availableSlots: 0,
      estimatedReturn: { ...project().estimatedReturn, maxPercent: '7.50' },
    });
    serve(p);
    await renderPage(<ProjectPage id={p.id} />, `/projects/${p.id}`);
    expect(await screen.findByRole('heading', { name: p.title })).toBeTruthy();
    expect(screen.queryByText('Simulate Returns')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Invest Now' })).toBeNull();
    expect(screen.queryByText('Variable Return')).toBeNull();
    expect(screen.getByText('At Maturity')).toBeTruthy();
  });

  it('says what went wrong, and tries again', async () => {
    await signedInAs('investor');
    let calls = 0;
    fakeServer(({ url }) =>
      url.pathname === '/api/projects/p1' && ++calls > 1
        ? { body: { data: project() } }
        : {
            status: 500,
            body: {
              statusCode: 500,
              code: 'INTERNAL_ERROR',
              message: 'Something went wrong',
            },
          },
    );
    await renderPage(<ProjectPage id="p1" />, '/projects/p1');
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(
      await screen.findByRole('heading', { name: project().title }),
    ).toBeTruthy();
  });
});
