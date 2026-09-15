/**
 * Inline icon set. Bundling a handful of 24px strokes beats pulling in an
 * icon library for a page this small, and it keeps the app fully offline.
 */
const Svg = ({ children, size = 20, fill = 'none', ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...rest}
  >
    {children}
  </svg>
);

export const IconSearch = (p) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></Svg>
);
export const IconHome = (p) => (
  <Svg {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V20h13V9.5" /></Svg>
);
export const IconCart = (p) => (
  <Svg {...p}><path d="M3 4h2l2.2 10.4a2 2 0 0 0 2 1.6h7.3a2 2 0 0 0 2-1.5L20 8H6" /><circle cx="10" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" /></Svg>
);
export const IconUser = (p) => (
  <Svg {...p}><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></Svg>
);
export const IconOrders = (p) => (
  <Svg {...p}><path d="M6 3h12v18l-6-3-6 3z" /><path d="M9 8h6M9 12h4" /></Svg>
);
export const IconBack = (p) => (
  <Svg {...p}><path d="M15 5 8 12l7 7" /></Svg>
);
export const IconChevron = (p) => (
  <Svg {...p}><path d="m9 5 7 7-7 7" /></Svg>
);
export const IconPlus = (p) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);
export const IconMinus = (p) => (
  <Svg {...p}><path d="M5 12h14" /></Svg>
);
export const IconCheck = (p) => (
  <Svg {...p}><path d="m4.5 12.5 5 5 10-11" /></Svg>
);
export const IconClose = (p) => (
  <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>
);
export const IconPin = (p) => (
  <Svg {...p}><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></Svg>
);
export const IconClock = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>
);
export const IconStore = (p) => (
  <Svg {...p}><path d="M4 9.5 5.5 4h13L20 9.5" /><path d="M4 9.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" /><path d="M5.5 11.5V20h13v-8.5" /><path d="M10 20v-5h4v5" /></Svg>
);
export const IconTruck = (p) => (
  <Svg {...p}><path d="M2.5 6.5h11v9h-11z" /><path d="M13.5 10h3.6l2.4 2.7v2.8h-6z" /><circle cx="6.5" cy="17.5" r="1.6" /><circle cx="16.5" cy="17.5" r="1.6" /></Svg>
);
export const IconFilter = (p) => (
  <Svg {...p}><path d="M4 6h16M7 12h10M10 18h4" /></Svg>
);
export const IconTrash = (p) => (
  <Svg {...p}><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></Svg>
);
export const IconEdit = (p) => (
  <Svg {...p}><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" /></Svg>
);
export const IconLogout = (p) => (
  <Svg {...p}><path d="M10 4H5v16h5" /><path d="m15 8 4 4-4 4M19 12H9" /></Svg>
);
export const IconShield = (p) => (
  <Svg {...p}><path d="M12 3 5 6v6c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6z" /><path d="m9 12 2 2 4-4" /></Svg>
);
export const IconSpinner = (p) => (
  <Svg {...p}><path d="M12 3a9 9 0 1 0 9 9" /></Svg>
);
export const IconWifiOff = (p) => (
  <Svg {...p}><path d="M3 5 21 19" /><path d="M5 12.5a11 11 0 0 1 4-2.6M2 9a16 16 0 0 1 5-3.2M22 9a16 16 0 0 0-8.5-3.6M19 12.5a11 11 0 0 0-2.4-1.8" /><path d="M8.5 16a5 5 0 0 1 6.2-.6" /><circle cx="12" cy="19.5" r="0.6" fill="currentColor" /></Svg>
);
export const IconRupee = (p) => (
  <Svg {...p}><path d="M7 4h10M7 8.5h10M15.5 4c0 4-3 4.5-5.5 4.5H7l8 11.5" /></Svg>
);
export const IconBox = (p) => (
  <Svg {...p}><path d="m12 3 8 4.2v9.6L12 21l-8-4.2V7.2z" /><path d="M4 7.2 12 11.5l8-4.3M12 11.5V21" /></Svg>
);
export const IconChart = (p) => (
  <Svg {...p}><path d="M4 20V4M4 20h16" /><path d="M8 17v-5M12 17V8M16 17v-7" /></Svg>
);
export const IconCopy = (p) => (
  <Svg {...p}><rect x="9" y="9" width="11" height="11" rx="2.2" /><path d="M15 6.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h.5" /></Svg>
);
export const IconRefresh = (p) => (
  <Svg {...p}><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v4.5h-4.5" /></Svg>
);
export const IconQr = (p) => (
  <Svg {...p}><rect x="4" y="4" width="6" height="6" rx="1.4" /><rect x="14" y="4" width="6" height="6" rx="1.4" /><rect x="4" y="14" width="6" height="6" rx="1.4" /><path d="M14 14h2.5v2.5H14zM20 14v2.5M17.5 20H20M14 20h1" /></Svg>
);
export const IconDownload = (p) => (
  <Svg {...p}><path d="M12 4v10m0 0 3.5-3.5M12 14l-3.5-3.5" /><path d="M5 17.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-1.5" /></Svg>
);
