// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeServer, renderPage, signedInAs } from '@/test/render';
import { DesignPreview } from './design-preview';
import { PageError, PageLoading } from './pages';
import { SessionUnknownError } from './session';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function failed(error: unknown) {
  await signedInAs('admin');
  fakeServer(() => undefined);
  const view = await renderPage(
    <PageError error={error as Error} reset={() => undefined} />,
    '/projects',
  );
  return view;
}

describe('a page that failed to open', () => {
  it('blames the connection when the server cannot be reached', async () => {
    await failed(new TypeError('Failed to fetch'));
    expect(screen.getByRole('alert').textContent).toBe(
      'Can’t reach WeGro. Check your internet connection and try again.',
    );
    cleanup();
    await failed(new SessionUnknownError());
    expect(screen.getByRole('alert').textContent).toContain(
      'Can’t reach WeGro',
    );
  });

  it('says what else went wrong, and opens the page again', async () => {
    const { router } = await failed(new Error('Chunk failed to load'));
    expect(screen.getByRole('alert').textContent).toBe('Chunk failed to load');
    const reload = vi.spyOn(router, 'invalidate');
    await userEvent.click(screen.getByRole('button', { name: /Try Again/ }));
    expect(reload).toHaveBeenCalled();
    cleanup();
    await failed('plain text');
    expect(screen.getByRole('alert').textContent).toBe('plain text');
  });
});

describe('while a page opens', () => {
  it('says it is loading', async () => {
    await signedInAs('admin');
    await renderPage(<PageLoading />, '/projects');
    expect(screen.getByText('Loading…')).toBeTruthy();
  });
});

describe('the design preview', () => {
  it('shows a toast from its main action', async () => {
    const { toast } = await import('sonner');
    const shown = vi.spyOn(toast, 'success').mockImplementation(() => 1);
    await signedInAs('admin');
    fakeServer(() => undefined);
    await renderPage(<DesignPreview />, '/design');
    await userEvent.click(screen.getByRole('button', { name: 'Main action' }));
    expect(shown).toHaveBeenCalledWith('Payment confirmed');
  });
});
