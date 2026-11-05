import { useEffect } from 'react';
// The source library's overlay variants share one focus boundary in Raeen.
export function useDialogFocus() {
  useEffect(() => {
    let active: HTMLElement | null = null;
    let previous: HTMLElement | null = null;
    const visible = (element: HTMLElement) =>
      element.getClientRects().length > 0 && !element.closest('[inert]');
    const focusables = () =>
      active
        ? [
            ...active.querySelectorAll<HTMLElement>(
              'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
            ),
          ].filter(visible)
        : [];
    const focusFirst = () => {
      const target = focusables()[0] ?? active;
      if (target) {
        if (target === active) target.tabIndex = -1;
        target.focus({ preventScroll: true });
      }
    };
    const refresh = () => {
      const dialogs = [
        ...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'),
      ].filter(visible);
      const next = dialogs.at(-1) ?? null;
      if (next === active) return;
      if (!active && next) previous = document.activeElement as HTMLElement;
      active = next;
      if (active) focusFirst();
      else if (previous?.isConnected) {
        previous.focus({ preventScroll: true });
        previous = null;
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !active) return;
      const items = focusables(),
        first = items[0],
        last = items.at(-1);
      if (!first) {
        event.preventDefault();
        focusFirst();
        return;
      }
      if (
        !active.contains(document.activeElement) ||
        (!event.shiftKey && document.activeElement === last) ||
        (event.shiftKey && document.activeElement === first)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (active && event.target instanceof Node && !active.contains(event.target)) focusFirst();
    };
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocus);
    refresh();
    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocus);
    };
  }, []);
}
