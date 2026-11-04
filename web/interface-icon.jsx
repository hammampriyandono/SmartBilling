import React from 'react';

const paths = {
  monitoring: 'M3 10 12 3l9 7 M5 9v11h5v-6h4v6h5V9',
  sessions: 'M3 5h18v14H3z M6 10h4 M6 14h2 M14 9q4 3 0 6 M17 7q6 5 0 10',
  billing: 'M5 3l2 1 2-1 3 1 3-1 2 1 2-1v18l-2-1-2 1-3-1-3 1-2-1-2 1z M8 8h8 M8 12h8 M8 16h4',
  reports: 'M4 3v17h17 M8 16v-4 M13 16V7 M18 16v-7',
  health: 'M2 12h5l3-7 4 14 3-7h5',
  admin: 'M3 7h5m6 0h7 M3 17h10m6 0h2 M8 4h5v6H8z M13 14h5v6h-5z',
  more: 'M3 4h7v7H3z M14 4h7v7h-7z M3 15h7v6H3z M14 15h7v6h-7z',
  power: 'm14 2-10 12h7l-1 8 10-13h-7z',
  powerSwitch: 'M12 3v9 M6.5 5.5a9 9 0 1 0 11 0',
  energy: 'm3 7 9-5 9 5-9 5z M3 12l9 5 9-5 M3 17l9 5 9-5',
  voltage: 'M2 13c4 0 3-8 7-8s3 14 7 14 3-8 6-8',
  current: 'M3 7h15m-4-4 4 4-4 4 M21 17H6m4-4-4 4 4 4',
  meter: 'M4 4h16v16H4z M7 8h10v4H7z M8 16h1m5 0h2',
  room: 'M4 21h16 M6 20V5l11-2v17 M13 12h.1',
  refresh: 'M20 9a8 8 0 0 0-14-3L3 9m0-6v6h6 M4 15a8 8 0 0 0 14 3l3-3m0 6v-6h-6',
  download: 'M12 3v12m-5-5 5 5 5-5 M4 16v5h16v-5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  eyeOff: 'm3 3 18 18 M10 5q7-1 12 7l-3 4 M6 6q-3 2-4 6c5 8 11 8 16 5 M10 10a3 3 0 0 0 4 4',
  arrowRight: 'M4 12h16m-6-6 6 6-6 6',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z m-4 9 3 3 5-6',
  logout: 'M10 4H4v16h6 M9 12h12m-5-5 5 5-5 5',
  calendar: 'M3 5h18v16H3z M3 10h18 M7 3v4m10-4v4',
  check: 'm4 12 5 5L20 6',
  close: 'm6 6 12 12 M18 6 6 18',
  chevron: 'm9 6 6 6-6 6',
  plus: 'M12 5v14 M5 12h14',
};

export function Icon({name, size = 20}) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d={paths[name]}/>
  </svg>;
}
