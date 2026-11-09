// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@/app/navigation';
import { project } from '@/test/fixtures';
import {
  fakeServer,
  type Reply,
  renderPage,
  signedInAs,
  type Sent,
} from '@/test/render';
import { ProjectsList } from './projects-list';
import type { ProjectsSearch } from './projects-search';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const catalog = {
  body: {
    data: {
      produceTypes: [{ code: 'MAIZE', name: 'Maize', nameBn: 'ভুট্টা' }],
      units: [],
      inputTypes: [],
      fieldRecordTypes: [],
      weatherEventTypes: [],
    },
  },
};
const page = (
  items: unknown[],
  total = items.length,
  totalPages = 1,
): Reply => ({
  body: { data: items, meta: { total, page: 1, limit: 12, totalPages } },
});

async function list(
  role: Role,
  search: ProjectsSearch = {},
  projects: (sent: Sent) => Reply = () => page([project()]),
  drafts = false,
) {
  await signedInAs(role);
  const sent = fakeServer((s) =>
    s.url.pathname === '/api/catalog'
      ? catalog
      : s.url.pathname === '/api/projects'
        ? projects(s)
        : undefined,
  );
  const view = await renderPage(
    <ProjectsList search={search} drafts={drafts} />,
    drafts ? '/projects/drafts' : '/projects',
  );
  return { sent, ...view };
}

describe('the projects list', () => {
  it('shows an investor the projects, with tabs including Saved', async () => {
    const { router, sent } = await list('investor', {}, () =>
      page([project()], 13, 2),
    );
    expect(await screen.findByText(project().title)).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Browse Projects' }),
    ).toBeTruthy();
    expect(screen.getByText('13 projects')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /New Project/ })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Stage' })).toBeNull();
    expect(
      screen.getByRole('tab', { name: 'All' }).getAttribute('aria-selected'),
    ).toBe('true');

    await userEvent.click(screen.getByRole('tab', { name: 'Saved' }));
    expect(router.state.location.search).toEqual({ tab: 'saved' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ page: 2 });
    expect(sent[sent.length - 1]!.url.searchParams.get('limit')).toBe('12');
  });

  it('asks for the tab, words, stage, crop and district it is given', async () => {
    const { sent } = await list('admin', {
      tab: 'long_term',
      q: 'maize',
      stage: 'funded',
      produce: 'MAIZE',
      district: 'BOGURA',
      page: 3,
    });
    await screen.findByText(project().title);
    const asked = sent.find((s) => s.url.pathname === '/api/projects')!.url
      .searchParams;
    expect(Object.fromEntries(asked)).toMatchObject({
      page: '3',
      q: 'maize',
      stage: 'funded',
      produceCode: 'MAIZE',
      districtCode: 'BOGURA',
      durationType: 'long_term',
    });
  });

  it('lets Operations add projects, as admins do', async () => {
    await list('operations');
    expect(
      (await screen.findByRole('link', { name: /New Project/ })).getAttribute(
        'href',
      ),
    ).toBe('/projects/new');
  });

  it('gives staff every stage, the filters and New Project', async () => {
    const { router } = await list('admin');
    expect(
      await screen.findByRole('heading', { name: 'All Projects' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /New Project/ }).getAttribute('href'),
    ).toBe('/projects/new');
    expect(screen.queryByRole('tab', { name: 'Saved' })).toBeNull();

    await userEvent.click(screen.getByRole('combobox', { name: 'Stage' }));
    await userEvent.click(
      await screen.findByRole('option', { name: 'Funded' }),
    );
    expect(router.state.location.search).toEqual({ stage: 'funded' });
    await userEvent.click(screen.getByRole('combobox', { name: 'Crop' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Maize' }));
    expect(router.state.location.search).toMatchObject({ produce: 'MAIZE' });
    await userEvent.click(screen.getByRole('combobox', { name: 'District' }));
    await userEvent.click(
      await screen.findByRole('option', { name: 'Bogura' }),
    );
    expect(router.state.location.search).toMatchObject({ district: 'BOGURA' });

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Title, place or crop' }),
      'paddy',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toMatchObject({ q: 'paddy' });
  });

  it('names a farmer’s list theirs', async () => {
    await list('farmer');
    expect(
      await screen.findByRole('heading', { name: 'My Projects' }),
    ).toBeTruthy();
  });

  it('says why the list is empty', async () => {
    const none = () => page([]);
    await list('investor', {}, none);
    expect(await screen.findByText('No projects yet')).toBeTruthy();
    cleanup();
    await list('investor', { tab: 'saved' }, none);
    expect(await screen.findByText('No saved projects yet')).toBeTruthy();
    cleanup();
    await list('investor', { tab: 'saved', q: 'jute' }, none);
    expect(await screen.findByText('No matching projects')).toBeTruthy();
    cleanup();
    await list('investor', { tab: 'short_term' }, none);
    expect(await screen.findByText('No matching projects')).toBeTruthy();
    cleanup();
    await list('admin', {}, none, true);
    expect(await screen.findByText('No drafts')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Drafts' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'All' })).toBeNull();
  });

  it('says what went wrong, and tries again', async () => {
    let calls = 0;
    await list('investor', {}, () =>
      ++calls > 1
        ? page([project()])
        : {
            status: 500,
            body: { statusCode: 500, code: 'INTERNAL_ERROR', message: 'x' },
          },
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText(project().title)).toBeTruthy();
  });
});
