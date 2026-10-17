import { useEffect, useState } from 'react';
import type {
  FieldRecordsUploadApiArg,
  FieldRecordsUploadApiResponse,
} from '@/api/generated/field-records';
import { baseApi } from './base-api';
import { apiFetch, apiUrl } from './http';

/**
 * What the generated endpoints cannot do on their own: send the photo upload
 * as multipart, and fetch file responses (photos, QR codes, CSV). Files are
 * never kept in the store; they are fetched with the session's token.
 */

export const filesApi = baseApi.injectEndpoints({
  // The generated fieldRecordsUpload would send its body as JSON: same
  // endpoint and types, body as multipart form data.
  overrideExisting: true,
  endpoints: (build) => ({
    fieldRecordsUpload: build.mutation<
      FieldRecordsUploadApiResponse,
      FieldRecordsUploadApiArg
    >({
      query: ({ body }) => {
        const form = new FormData();
        if (body.file) form.append('file', body.file);
        return { url: '/api/photos', method: 'POST', body: form };
      },
    }),
  }),
});

/** Uploads a photo; use the returned id in a farm update, delivery, claim or bill. */
export const { useFieldRecordsUploadMutation: usePhotoUploadMutation } =
  filesApi;

/** Fetches an API file (photo, QR code) and gives an object URL to show it. */
export function useApiFile(path: string | null | undefined): {
  url: string | null;
  error: boolean;
} {
  const [state, setState] = useState<{ url: string | null; error: boolean }>({
    url: null,
    error: false,
  });
  useEffect(() => {
    if (!path) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    apiFetch(apiUrl(path))
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        objectUrl = URL.createObjectURL(await res.blob());
        if (!cancelled) setState({ url: objectUrl, error: false });
      })
      .catch(() => {
        if (!cancelled) setState({ url: null, error: true });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  return path ? state : { url: null, error: false };
}

/** Downloads an API file (CSV report, statement) under the server's name. */
export async function downloadFile(path: string): Promise<void> {
  const res = await apiFetch(apiUrl(path));
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const name =
    /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i
      .exec(res.headers.get('Content-Disposition') ?? '')?.[1]
      ?.trim() ??
    path.split('/').pop() ??
    'download';
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = decodeURIComponent(name);
  a.click();
  URL.revokeObjectURL(url);
}
