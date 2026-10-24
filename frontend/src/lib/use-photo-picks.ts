import { useRef, useState } from 'react';
import { usePhotoUploadMutation } from '@/api/files';
import { shrinkPhoto } from '@/features/farm-updates/photo';

/** A photo picked for a record, sent to the server as soon as it is chosen. */
export interface PickedPhoto {
  key: number;
  blob: Blob;
  id: string | null;
  failed: boolean;
}

/**
 * Photos for a form: each is shrunk on the phone and uploaded at once, so
 * the form sends only their ids. At most `max`.
 */
export function usePhotoPicks(max: number) {
  const [upload] = usePhotoUploadMutation();
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const keys = useRef(0);

  const patch = (key: number, p: Partial<PickedPhoto>) =>
    setPhotos((ps) => ps.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function add(files: FileList | null) {
    const room = max - photos.length;
    for (const file of Array.from(files ?? []).slice(0, room)) {
      const key = ++keys.current;
      const blob = await shrinkPhoto(file);
      setPhotos((ps) => [...ps, { key, blob, id: null, failed: false }]);
      upload({ body: { file: blob } })
        .unwrap()
        .then((res) => patch(key, { id: res.data.id }))
        .catch(() => patch(key, { failed: true }));
    }
  }

  return {
    photos,
    max,
    add,
    remove: (key: number) => setPhotos((ps) => ps.filter((x) => x.key !== key)),
    /** Some photo is still being sent. */
    uploading: photos.some((p) => !p.id && !p.failed),
    /** Ids of the photos that reached the server, in the order picked. */
    ids: photos.flatMap((p) => (p.id ? [p.id] : [])),
  };
}
