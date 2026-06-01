export interface InstrumentMapping {
  contains: string;
  instrument: string;
}

export const INSTRUMENT_MAPPINGS: InstrumentMapping[] = [
  { contains: 'MHG',   instrument: 'MICRO COPPER' },
  { contains: 'CPE',   instrument: 'COPPER' },
  { contains: 'SIL',   instrument: 'MICRO SILVER' },
  { contains: 'MGC',   instrument: 'MICRO GOLD' },
  { contains: 'GCE',   instrument: 'GOLD' },
  { contains: 'MNG',   instrument: 'MICRO NATURAL GAS' },
  { contains: 'NGE',   instrument: 'NATURAL GAS' },
  { contains: 'MCL',   instrument: 'MICRO CRUDE OIL' },
  { contains: 'CLE',   instrument: 'CRUDE OIL' },
  { contains: 'RBE',   instrument: 'GASOLINE' },
  { contains: 'HO',    instrument: 'HEATING OIL' },
  { contains: 'GF',    instrument: 'FEEDER CATTLE' },
  { contains: 'US.HE', instrument: 'LEAN HOGS' },
  { contains: 'GLE',   instrument: 'LIVE CATTLE' },
  { contains: 'ZLE',   instrument: 'SOYBEAN OIL' },
  { contains: 'EP',    instrument: 'S&P 500' },
  { contains: 'RTY',   instrument: 'RUSSELL 2000' },
  { contains: 'MBT',   instrument: 'MICRO BITCOIN' },
  { contains: 'MES',   instrument: 'MICRO S&P 500' },
  { contains: 'ENQ',   instrument: 'NASDAQ' },
  { contains: 'MNQ',   instrument: 'MICRO NASDAQ' },
  { contains: 'MYM',   instrument: 'MICRO DOW JONES' },
  { contains: 'US.YM', instrument: 'DOW JONES' },
  { contains: 'M6A',   instrument: 'MICRO AUD/USD' },
  { contains: 'M6B',   instrument: 'MICRO GBP/USD' },
  { contains: 'M6E',   instrument: 'MICRO EUR/USD' },
];