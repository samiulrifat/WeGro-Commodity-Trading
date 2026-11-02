// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePhotoPicks } from '@/lib/use-photo-picks';
import { fakeServer, recordForms, renderPage, signedInAs } from '@/test/render';
import { PhotoPicker } from './photo-picker';
import { PrintSheet } from './print-sheet';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.classList.remove('printing');
});

function Picker() {
  const picks = usePhotoPicks(2);
  return <PhotoPicker picks={picks} invalid />;
}

describe('picking photos', () => {
  it('adds up to the limit, says which were not sent, and removes one', async () => {
    recordForms();
    Object.assign(URL, {
      createObjectURL: () => 'blob:p',
      revokeObjectURL: () => undefined,
    });
    await signedInAs('seller');
    let calls = 0;
    fakeServer(() =>
      ++calls === 1
        ? { status: 201, body: { data: { id: 'ph1', mimeType: 'image/jpeg' } } }
        : { status: 500, body: { statusCode: 500, message: 'x' } },
    );
    await renderPage(<Picker />, '/marketplace');
    const picker = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(() => undefined);
    await userEvent.click(screen.getByRole('button', { name: /Add Photo/ }));
    expect(picker).toHaveBeenCalled();
    picker.mockRestore();
    const input = document.querySelector(
      'input[type=file]',
    ) as HTMLInputElement;
    await userEvent.upload(input, [
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
      new File(['c'], 'c.jpg', { type: 'image/jpeg' }),
    ]);
    expect(await screen.findByText('Not Sent')).toBeTruthy();
    const removes = screen.getAllByRole('button', { name: 'Remove Photo' });
    expect(removes).toHaveLength(2);
    // Full: no tile to add more.
    expect(screen.queryByRole('button', { name: /Add Photo/ })).toBeNull();
    await userEvent.click(removes[1]!);
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'Remove Photo' }),
      ).toHaveLength(1),
    );
    expect(screen.getByRole('button', { name: /Add Photo/ })).toBeTruthy();
  });
});

/** jsdom has no image decoding: each picture answers `decode`. */
function decodes(decode: () => Promise<void>) {
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    value: decode,
    configurable: true,
  });
}

describe('printing a sheet', () => {
  afterEach(() => {
    Reflect.deleteProperty(HTMLImageElement.prototype, 'decode');
  });

  it('waits for its pictures, even one that will not load', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    decodes(() => Promise.reject(new Error('broken')));
    const onDone = vi.fn();
    render(
      <PrintSheet onDone={onDone}>
        <img src="/a.png" alt="" />
        <img src="/a.png" alt="" />
      </PrintSheet>,
    );
    await waitFor(() => expect(print).toHaveBeenCalledOnce());
    act(() => void window.dispatchEvent(new Event('afterprint')));
    expect(onDone).toHaveBeenCalled();
  });

  it('does not print once closed before its pictures are ready', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    let ready!: () => void;
    decodes(
      () =>
        new Promise<void>((r) => {
          ready = r;
        }),
    );
    const { unmount } = render(
      <PrintSheet onDone={() => undefined}>
        <img src="/b.png" alt="" />
      </PrintSheet>,
    );
    unmount();
    ready();
    await new Promise((r) => setTimeout(r, 20));
    expect(print).not.toHaveBeenCalled();
    expect(document.body.classList.contains('printing')).toBe(false);
  });
});
