// Money = integer satang (1 บาท = 100 สตางค์). Never use floats for stored amounts.
export type Satang = number;

export function assertSatang(n: number, label = 'amount'): Satang {
  if (!Number.isSafeInteger(n)) throw new Error(`${label} must be an integer number of satang, got ${n}`);
  return n;
}

/** "1,234.50" | "1234.5" | "฿99" | 120 → satang. Rejects more than 2 decimals. */
export function parseBaht(input: string | number): Satang {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error(`Invalid amount: ${input}`);
    return Math.round(input * 100);
  }
  const s = input.replace(/[฿,\s]|บาท/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new Error(`Invalid amount: "${input}"`);
  const neg = s.startsWith('-');
  const [whole, frac = ''] = s.replace('-', '').split('.');
  const v = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return neg ? -v : v;
}

export function formatBaht(satang: Satang, opts: { decimals?: boolean; sign?: boolean } = {}): string {
  const neg = satang < 0;
  const abs = Math.abs(satang);
  const baht = Math.floor(abs / 100);
  const st = abs % 100;
  const showDec = opts.decimals ?? st !== 0;
  const body = baht.toLocaleString('en-US') + (showDec ? '.' + String(st).padStart(2, '0') : '');
  const sign = neg ? '-' : opts.sign ? '+' : '';
  return `${sign}฿${body}`;
}

export const sum = (xs: Satang[]): Satang => xs.reduce((a, b) => a + b, 0);

/** Multiply by a rate and round half-up to the satang. */
export const mulRate = (s: Satang, rate: number): Satang => Math.round(s * rate);
