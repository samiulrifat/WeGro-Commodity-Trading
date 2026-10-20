// Tests run in Node, which has no page: give requests an origin to resolve
// against, as the browser does.
if (!('location' in globalThis)) {
  Object.defineProperty(globalThis, 'location', {
    value: new URL('http://localhost'),
  });
}

// Page tests run in jsdom, which has no scrolling; the router scrolls on navigation.
if (typeof window !== 'undefined') {
  window.scrollTo = () => undefined;
}

// jsdom has no PointerEvent; Base UI's radios create one when clicked.
if (typeof window !== 'undefined' && !('PointerEvent' in window)) {
  Object.defineProperty(window, 'PointerEvent', { value: MouseEvent });
}
