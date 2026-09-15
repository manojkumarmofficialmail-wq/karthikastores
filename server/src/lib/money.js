/** Render paise as a rupee string for emails, notes and order numbers. */
export const formatPaise = (paise) =>
  `₹${(Number(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const rupeesToPaise = (rupees) => Math.round(Number(rupees) * 100);
