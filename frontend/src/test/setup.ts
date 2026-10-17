// Tests run in Node, which has no page: give requests an origin to resolve
// against, as the browser does.
if (!('location' in globalThis)) {
  Object.defineProperty(globalThis, 'location', {
    value: new URL('http://localhost'),
  });
}
