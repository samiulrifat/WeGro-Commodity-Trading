// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { store } from '@/store/store';
import { renderPage, signedInAs } from '@/test/render';
import { LanguageSwitch } from './language-switch';
import { Pager } from './pager';
import { SearchBox } from './search-box';
import { EmptyState, ErrorState, LoadingState } from './states';

afterEach(cleanup);

describe('search box', () => {
  it('searches on Find and on Enter, trimmed, and clears', async () => {
    await signedInAs('admin');
    const onSearch = vi.fn();
    await renderPage(
      <SearchBox value="old" onSearch={onSearch} placeholder="Name" />,
      '/list',
    );
    const box = screen.getByRole('searchbox', { name: 'Name' });
    await userEvent.clear(box);
    await userEvent.type(box, '  Rahim  ');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(onSearch).toHaveBeenLastCalledWith('Rahim');
    await userEvent.type(box, '{Enter}');
    expect(onSearch).toHaveBeenCalledTimes(2);
    await userEvent.clear(box);
    await userEvent.type(box, '   {Enter}');
    expect(onSearch).toHaveBeenLastCalledWith(undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Clear Search' }));
    expect(box).toHaveProperty('value', '');
    expect(onSearch).toHaveBeenLastCalledWith(undefined);
  });

  it('inside another form, never submits that form', async () => {
    await signedInAs('admin');
    const onSearch = vi.fn();
    const outer = vi.fn((e: { preventDefault: () => void }) =>
      e.preventDefault(),
    );
    await renderPage(
      <form onSubmit={outer}>
        <SearchBox
          value={undefined}
          onSearch={onSearch}
          placeholder="Farmer"
          inForm
        />
      </form>,
      '/form',
    );
    const box = screen.getByRole('searchbox', { name: 'Farmer' });
    await userEvent.type(box, 'Karim{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(onSearch).toHaveBeenCalledTimes(2);
    expect(onSearch).toHaveBeenLastCalledWith('Karim');
    expect(outer).not.toHaveBeenCalled();
    // Nothing searched yet from the address, so nothing to clear.
    expect(screen.queryByRole('button', { name: 'Clear Search' })).toBeNull();
  });
});

describe('pager', () => {
  it('shows nothing for a single page', async () => {
    await signedInAs('admin');
    await renderPage(
      <Pager page={1} pages={1} total={8} onPage={vi.fn()} />,
      '/list',
    );
    expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull();
  });

  it('says where you are and stops at either end', async () => {
    await signedInAs('admin');
    const onPage = vi.fn();
    const view = await renderPage(
      <Pager page={1} pages={3} total={1234} onPage={onPage} />,
      '/list',
    );
    expect(screen.getByText('Page 1 of 3, 1,234 in all')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Previous' })).toHaveProperty(
      'disabled',
      true,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPage).toHaveBeenLastCalledWith(2);
    view.unmount();
    await renderPage(
      <Pager page={3} pages={3} total={1234} onPage={onPage} />,
      '/list',
    );
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty(
      'disabled',
      true,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPage).toHaveBeenLastCalledWith(2);
  });
});

describe('language switch', () => {
  it('names each language with the words it shows, and switches', async () => {
    await signedInAs('admin');
    await renderPage(<LanguageSwitch />, '/');
    // Heard as "EN, English": what is heard holds what is seen (WCAG 2.5.3).
    const english = screen.getByRole('button', { name: /^EN ?, English$/ });
    const bengali = screen.getByRole('button', { name: 'বাংলা' });
    expect(english.getAttribute('aria-pressed')).toBe('true');
    expect(bengali.getAttribute('lang')).toBe('bn');
    await userEvent.click(bengali);
    expect(store.getState().language.current).toBe('bn');
    expect(bengali.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('page states', () => {
  it('announces loading, and says plainly when there is nothing', async () => {
    await signedInAs('admin');
    await renderPage(
      <>
        <LoadingState />
        <EmptyState />
      </>,
      '/list',
    );
    const loading = screen.getByRole('status');
    expect(loading.textContent).toBe('Loading…');
    expect(loading.getAttribute('aria-live')).toBe('polite');
    expect(screen.getByText('No Records Yet')).toBeTruthy();
  });

  it('words a failure from its code, gives the reference and retries', async () => {
    await signedInAs('admin');
    const onRetry = vi.fn();
    await renderPage(
      <ErrorState
        error={{
          kind: 'forbidden',
          status: 403,
          messages: ['Forbidden resource'],
          code: 'ROLE_NOT_ALLOWED',
          requestId: 'req-42',
        }}
        onRetry={onRetry}
      />,
      '/list',
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'Your role cannot do this.',
    );
    expect(screen.getByText('Reference: req-42')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('words a lost connection by its kind, with no retry unless offered', async () => {
    await signedInAs('admin');
    await renderPage(
      <ErrorState error={{ kind: 'network', status: null, messages: [] }} />,
      '/list',
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'Can’t reach WeGro. Check your internet connection and try again.',
    );
    expect(screen.queryByRole('button', { name: 'Try Again' })).toBeNull();
  });
});
