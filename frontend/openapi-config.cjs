// Generates the RTK Query endpoints from the backend's OpenAPI document.
//   npm run api:generate          (the backend must be running)
// One file per backend area in src/api/generated/; never edit them by hand.

const schemaFile = process.env.OPENAPI_URL || 'http://localhost:3000/docs-json';

// Backend tags (Swagger groups) -> generated file.
const AREAS = {
  Auth: 'auth',
  Participants: 'participants',
  'Bank accounts': 'bank-accounts',
  'Bank list': 'bank-list',
  'Payment accounts': 'payment-accounts',
  'Payment proofs': 'payment-proofs',
  Catalog: 'catalog',
  Projects: 'projects',
  Vouchers: 'vouchers',
  'Field records': 'field-records',
  Warehouse: 'warehouse',
  Verify: 'verify',
  Marketplace: 'marketplace',
  Insurance: 'insurance',
  Settlement: 'settlement',
  'Track record': 'track-record',
  Dashboard: 'dashboard',
  Notifications: 'notifications',
  Audit: 'audit',
  Jobs: 'jobs',
  Health: 'health',
};

/**
 * File responses (photos, QR codes, CSV) are fetched by src/api/files.ts,
 * never kept in the store. (The photo upload is generated for its types;
 * files.ts sends its body as multipart.)
 */
const handledByHand = (operation) =>
  Object.entries(operation.responses ?? {}).some(
    ([status, r]) =>
      status.startsWith('2') && r.content && !('application/json' in r.content),
  );

/** @type {import('@rtk-query/codegen-openapi').ConfigFile} */
module.exports = {
  schemaFile,
  apiFile: './src/api/base-api.ts',
  apiImport: 'baseApi',
  hooks: { queries: true, lazyQueries: true, mutations: true },
  // Each area's mutations refresh that area's queries.
  tag: true,
  useUnknown: true,
  outputFiles: Object.fromEntries(
    Object.entries(AREAS).map(([tag, file]) => [
      `./src/api/generated/${file}.ts`,
      {
        // projectsApi, bankAccountsApi, ...: one name per area.
        exportName: `${file.replace(/-(\w)/g, (_, c) => c.toUpperCase())}Api`,
        filterEndpoints: (_name, def) =>
          (def.operation.tags ?? []).includes(tag) &&
          !handledByHand(def.operation),
      },
    ]),
  ),
};
