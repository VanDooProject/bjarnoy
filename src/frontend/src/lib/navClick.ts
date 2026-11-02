/**
 * Whether a click on an `<a href>` is one the app handles itself (in-app
 * navigation): primary button, no modifier key. Ctrl/Cmd/Shift/Alt and
 * middle clicks are left to the browser, so the link opens in a new tab or
 * window the way any link on the web does.
 */
export function isPlainLeftClick(event: MouseEvent): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey
  );
}
