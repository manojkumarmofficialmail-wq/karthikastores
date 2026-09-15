import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { IconRefresh, IconSpinner } from './Icons.jsx';

/**
 * The app shell.
 *
 * One element owns the scrolling, and everything pinned — the tab bar, the
 * cart bar, sheets, toasts — is positioned against it rather than against the
 * browser window. That single decision is what lets the same markup be a
 * full-screen app on a phone and a phone-shaped window on a desktop, and it
 * is why `styles.css` makes `.app` a CSS container.
 *
 * It also gives the app somewhere to put the two behaviours people expect
 * from an installed app and never get from a web page: a screen always starts
 * at the top, and pulling down at the top refreshes it.
 */

const ShellContext = createContext(null);

/** Register what "pull down to refresh" should do on the current screen. */
export const usePullToRefresh = (handler, deps = []) => {
  const shell = useContext(ShellContext);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useCallback(handler, deps);
  useEffect(() => shell?.registerRefresh(stable), [shell, stable]);
};

/** The scrolling element, for anything that needs to move it by hand. */
export const useShellElement = () => useContext(ShellContext)?.element ?? null;

const PULL_TRIGGER = 72;
const PULL_MAX = 110;

export const AppShell = ({ children }) => {
  const { pathname } = useLocation();
  const ref = useRef(null);
  const refresher = useRef(null);
  const start = useRef(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const registerRefresh = useCallback((handler) => {
    refresher.current = handler;
    return () => {
      if (refresher.current === handler) refresher.current = null;
    };
  }, []);

  const value = useMemo(
    () => ({ registerRefresh, element: ref.current }),
    [registerRefresh, pathname]
  );

  // A new screen starts at the top, the way a native push does.
  useEffect(() => {
    ref.current?.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }, [pathname]);

  /* ------------------------- pull to refresh ------------------------- */
  const onTouchStart = (event) => {
    if (refreshing || !refresher.current) return;
    if ((ref.current?.scrollTop ?? 0) > 0) return;
    start.current = event.touches[0].clientY;
  };

  const onTouchMove = (event) => {
    if (start.current === null) return;
    const delta = event.touches[0].clientY - start.current;
    if (delta <= 0) {
      // Scrolling back up the page, not pulling past the top.
      start.current = null;
      setPull(0);
      return;
    }
    // Resistance: the last few pixels are the hardest, so the gesture has a
    // definite end rather than stretching forever.
    setPull(Math.min(PULL_MAX, delta * 0.45));
  };

  const onTouchEnd = async () => {
    if (start.current === null) return;
    const travelled = pull;
    start.current = null;
    setPull(0);
    if (travelled < PULL_TRIGGER || !refresher.current) return;
    setRefreshing(true);
    try {
      await refresher.current();
    } catch {
      // The screen's own error handling has already spoken; a failed refresh
      // must not leave the spinner up forever.
    } finally {
      setRefreshing(false);
    }
  };

  const offset = refreshing ? 44 : pull;
  const isWide = pathname.startsWith('/admin');

  return (
    <ShellContext.Provider value={value}>
      <div
        className={`app ${isWide ? 'app--wide' : ''}`}
        id="app-shell"
        ref={ref}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {offset > 0 && (
          <div className="ptr" style={{ top: offset - 34, opacity: Math.min(1, offset / 50) }}>
            <span className="ptr__ring">
              {refreshing ? (
                <span className="spin"><IconSpinner size={16} /></span>
              ) : (
                <IconRefresh size={16} style={{ transform: `rotate(${offset * 3}deg)` }} />
              )}
            </span>
          </div>
        )}
        {children}
      </div>
    </ShellContext.Provider>
  );
};
