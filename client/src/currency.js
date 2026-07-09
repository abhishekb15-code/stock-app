// Currency-aware money formatting. Holdings keep their native currency (₹, $,
// £, …); totals are shown per-currency, never converted/mixed.

const SYMBOLS = {
  INR: '₹', USD: '$', GBP: '£', EUR: '€', JPY: '¥',
  HKD: 'HK$', SGD: 'S$', AUD: 'A$', CAD: 'C$', CHF: 'CHF ', AED: 'AED ',
};

export function curSymbol(code) {
  return SYMBOLS[code] || (code ? `${code} ` : '₹');
}

export function money(v, code = 'INR') {
  const locale = code === 'INR' ? 'en-IN' : 'en-US';
  return `${curSymbol(code)}${Number(v || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function signedMoney(v, code = 'INR') {
  return `${v >= 0 ? '+' : '-'}${money(Math.abs(v), code)}`;
}
