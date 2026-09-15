import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from './Icons.jsx';

/**
 * Bottom sheet on phones, centred dialog on wide screens. Escape closes it,
 * the screen behind it stops scrolling, and focus moves into the panel — the
 * behaviours that make a web modal feel like a native one.
 *
 * It portals into the app shell rather than the document body, so on a
 * desktop it rises inside the phone frame instead of dimming the whole
 * browser window. Falling back to the body keeps it usable if it is ever
 * rendered outside the shell.
 */
export const Sheet = ({ open, title, onClose, children, footer }) => {
  const panel = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    // The shell is the scroller, so that is what must stop moving.
    const shell = document.getElementById('app-shell') ?? document.body;
    const previousOverflow = shell.style.overflow;
    shell.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    panel.current?.focus();
    return () => {
      shell.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="sheet-backdrop"
      onClick={(event) => event.target === event.currentTarget && onClose?.()}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panel}
      >
        <div className="sheet__grip" />
        {title && (
          <div className="sheet__title">
            <h2>{title}</h2>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Close">
              <IconClose size={18} />
            </button>
          </div>
        )}
        {children}
        {footer && <div style={{ marginTop: 16 }}>{footer}</div>}
      </div>
    </div>,
    document.getElementById('app-shell') ?? document.body
  );
};
