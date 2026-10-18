/** Only paths inside the app: never another site after signing in. */
export const internalPath = (value: unknown): string | undefined =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : undefined;
