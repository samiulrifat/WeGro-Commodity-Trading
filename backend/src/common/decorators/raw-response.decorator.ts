import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE = 'rawResponse';

/** Skip the `{ data }` envelope, e.g. for a CSV download or a file stream. */
export const RawResponse = () => SetMetadata(RAW_RESPONSE, true);
