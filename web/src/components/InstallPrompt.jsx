import { useEffect, useState } from 'react';
import { Sheet } from './Sheet.jsx';
import { IconClose } from './Icons.jsx';

/**
 * "Add to home screen".
 *
 * Chrome hands us a real prompt through `beforeinstallprompt`. iOS Safari
 * does not, and never will, so there the only honest thing to do is show the
 * two taps it actually takes. Either way this appears once, stays dismissed
 * for a month, and never shows to somebody already running the installed app.
 */
const DISMISS_KEY = 'ks.install.dismissed';
const DISMISS_DAYS = 30;

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

const isIos = () =>
  /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !/crios|fxios/i.test(window.navigator.userAgent);

const recentlyDismissed = () => {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Boolean(at) && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    // Private mode, or storage blocked. Treat it as "not dismissed" rather
    // than crashing the shell over a banner.
    return false;
  }
};

export const InstallPrompt = () => {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);
  const [howTo, setHowTo] = useState(false);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return undefined;

    const onPrompt = (event) => {
      event.preventDefault();
      setDeferred(event);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // iOS gets the banner without an event to wait for.
    const timer = isIos() ? setTimeout(() => setVisible(true), 4000) : null;

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* nothing to do — the banner simply reappears next session */
    }
  };

  const install = async () => {
    if (!deferred) return setHowTo(true);
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === 'accepted') setVisible(false);
    else dismiss();
    return undefined;
  };

  if (!visible) return null;

  return (
    <>
      <div className="install">
        <span className="install__mark" aria-hidden="true">🛍️</span>
        <div className="grow">
          <strong className="small">Keep the shop on your home screen</strong>
          <div className="tiny muted">Opens full screen, and the aisles work offline.</div>
        </div>
        <button type="button" className="btn btn--sm btn--primary" onClick={install}>
          Add
        </button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={dismiss} aria-label="Not now">
          <IconClose size={16} />
        </button>
      </div>

      <Sheet open={howTo} title="Add to your home screen" onClose={() => setHowTo(false)}>
        <ol className="stack small" style={{ gap: 10, paddingLeft: 18, margin: 0 }}>
          <li>Tap the Share button at the bottom of Safari.</li>
          <li>Scroll down and choose <strong>Add to Home Screen</strong>.</li>
          <li>Tap <strong>Add</strong> — Karthika Stores opens like any other app.</li>
        </ol>
        <button
          type="button"
          className="btn btn--primary btn--block"
          style={{ marginTop: 16 }}
          onClick={() => {
            setHowTo(false);
            dismiss();
          }}
        >
          Got it
        </button>
      </Sheet>
    </>
  );
};
