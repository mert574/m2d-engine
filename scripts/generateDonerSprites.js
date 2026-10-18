// Original vector artwork for the Doner demo. MIT; see the project LICENSE.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const output = new URL('../src/examples/doner/sprites/', import.meta.url);
mkdirSync(output, { recursive: true });
const repeat = (count, draw) => Array.from({ length: count }, (_, i) => draw(i)).join('');
const leaf = (x, y, color, angle = 0) => `<g transform="translate(${x} ${y}) rotate(${angle})"><path d="M-25 0Q-32-18-13-19Q0-32 13-19Q33-17 25 0Q31 16 9 18Q-5 31-17 16Q-35 17-25 0Z" fill="${color}" stroke="#346431" stroke-width="3"/><path d="M-18 9L18-10M0 0L-4-13M4-2L17 6" fill="none" stroke="#c1dd80" stroke-width="2"/></g>`;
const greens = repeat(7, i => leaf(34 + i * 28, 46 + (i % 2) * 8, i % 2 ? '#65a43b' : '#8bc34a', i * 19 - 40));
const bread = `<path d="M14 46Q19 15 61 20Q119 5 180 20Q219 19 226 47L220 65Q121 87 21 65Z" fill="url(#bread)" stroke="#85441f" stroke-width="4"/><path d="M22 45Q120 22 219 44L216 56Q119 77 25 56Z" fill="#f5d79b" stroke="#b77a37" stroke-width="3"/>${repeat(18, i => `<circle cx="${33 + (i * 43) % 173}" cy="${42 + (i * 7) % 17}" r="2" fill="#c69b62"/>`)}`;
const sprites = {
  BreadOpen: bread,
  BreadClosed: `<path d="M13 61Q16 18 62 17Q119 0 178 17Q223 19 227 61Q119 88 13 61Z" fill="url(#bread)" stroke="#85441f" stroke-width="4"/><path d="M18 58Q120 78 222 58" fill="none" stroke="#9d602c" stroke-width="4"/>${repeat(24, i => `<ellipse cx="${31 + (i * 29) % 177}" cy="${24 + (i * 11) % 30}" rx="3" ry="1.5" transform="rotate(${i * 17},${31 + (i * 29) % 177},${24 + (i * 11) % 30})" fill="#fff0bb"/>`)}`,
  MeatVeal: repeat(10, i => `<path d="M${17 + i * 19} ${37 + (i % 3) * 8}q-5-13 12-16l25 6q13 4 4 16l-18 22q-11 11-21 0Z" fill="${['#9d492b', '#bb6740', '#783a24'][i % 3]}" stroke="#572d20" stroke-width="3"/><path d="M${29 + i * 19} ${38 + (i % 3) * 8}l11 4" stroke="#df9663" stroke-width="3" stroke-linecap="round"/>`),
  Salad: greens,
  Onion: repeat(6, i => `<g transform="translate(${39 + i * 32} ${43 + (i % 2) * 12}) rotate(${i % 2 ? -16 : 15})"><ellipse rx="31" ry="23" fill="#f4dcec" stroke="#9a4c88" stroke-width="4"/><ellipse rx="22" ry="16" fill="none" stroke="#b976a4" stroke-width="3"/><ellipse rx="12" ry="8" fill="none" stroke="#c998bb" stroke-width="3"/></g>`),
  SauceA: `<path d="M20 52Q27 29 48 41Q65 59 83 42T120 42T157 42T194 43Q217 30 222 51Q220 67 198 61Q177 78 158 59Q138 73 120 58Q99 74 82 59Q60 75 43 57Q23 72 20 52Z" fill="#fff3cf" stroke="#c6b37d" stroke-width="3"/><path d="M31 48Q46 39 60 50T95 49T132 48T168 49T208 48" fill="none" stroke="#fffdf1" stroke-width="7" stroke-linecap="round"/>`,
  SauerKraut: repeat(24, i => `<path d="M${20 + (i * 31) % 172} ${28 + (i * 13) % 31}q-15 13 5 16q19 2 22-9q3-9 18-2" fill="none" stroke="${['#e9d37b', '#f6e8a4', '#c6af56'][i % 3]}" stroke-width="7" stroke-linecap="round"/>`),
  SpecialSalad: greens + repeat(5, i => `<g transform="translate(${40 + i * 37} ${43 + (i % 2) * 15})"><circle r="17" fill="#e96743" stroke="#a4372e" stroke-width="3"/><path d="M-10 0H10M0-10V10" stroke="#ffb17b" stroke-width="3"/><circle r="4" fill="#f3d58a"/></g>`) + repeat(3, i => `<g transform="translate(${64 + i * 62} ${55 - (i % 2) * 22})"><circle r="12" fill="#d5e4a0" stroke="#427641" stroke-width="4"/><circle r="4" fill="#f3edcb"/></g>`),
  Plate: `<ellipse cx="120" cy="51" rx="113" ry="31" fill="#b2b8b8" stroke="#606b72" stroke-width="4"/><ellipse cx="120" cy="43" rx="113" ry="29" fill="#edf1ec" stroke="#87969a" stroke-width="3"/><ellipse cx="120" cy="43" rx="90" ry="19" fill="#d7e0dc" stroke="#b2c3c3" stroke-width="3"/>`,
  Pills: `<g transform="translate(50 15) rotate(12 70 30)"><rect width="142" height="55" rx="27" fill="#f9e9dd" stroke="#79352e" stroke-width="4"/><path d="M71 0H114A27 27 0 0 1 114 55H71Z" fill="#d45154"/><path d="M71 2V53" stroke="#79352e" stroke-width="3"/><path d="M89 10H115" stroke="#ee9290" stroke-width="5" stroke-linecap="round"/></g>`,
  Book: `<path d="M47 16L175 10L204 63L73 78L42 34Z" fill="#8b3e3b" stroke="#482c2f" stroke-width="4"/><path d="M52 32L178 22L195 59L69 72Z" fill="#efe0bb" stroke="#684a39" stroke-width="3"/><path d="M47 16L175 10L190 47L62 60Z" fill="#b95b4e" stroke="#663531" stroke-width="4"/><path d="M70 17L85 57M106 27L153 22" stroke="#e8af6b" stroke-width="5"/>`,
  Fish: `<path d="M53 44L17 17L23 74Z" fill="#63999b" stroke="#315865" stroke-width="4"/><path d="M46 46Q107-10 212 43Q129 100 46 46Z" fill="#87bdbe" stroke="#315865" stroke-width="4"/><path d="M92 25L121 9L143 23M105 66L132 81L150 64" fill="#5a929c" stroke="#315865" stroke-width="3"/><path d="M168 25Q150 44 170 64" fill="none" stroke="#527f89" stroke-width="3"/><circle cx="184" cy="41" r="7" fill="#fff1d7"/><circle cx="186" cy="41" r="3" fill="#263a43"/>`,
  Key: `<circle cx="58" cy="42" r="27" fill="#e9b94e" stroke="#87622e" stroke-width="5"/><circle cx="58" cy="42" r="12" fill="#574937" stroke="#ffdd76" stroke-width="3"/><path d="M84 34H213V48H193V66H178V49H160V61H145V49H84Z" fill="#e9b94e" stroke="#87622e" stroke-width="4"/>`,
  Nails: repeat(3, i => `<g transform="translate(${38 + i * 54} ${19 + (i % 2) * 7}) rotate(${i * 21 - 18})"><path d="M12 7H26L22 55L18 65L14 55Z" fill="#aebec5" stroke="#43535e" stroke-width="3"/><rect x="1" y="1" width="36" height="10" rx="3" fill="#d1d9db" stroke="#43535e" stroke-width="3"/></g>`),
  Oil: `<g transform="translate(79 5) rotate(12 38 40)"><path d="M23 16H56L58 29L71 39V75H8V39L21 29Z" fill="#55664a" stroke="#2a3b36" stroke-width="4"/><rect x="24" y="4" width="31" height="15" rx="3" fill="#be9149" stroke="#77582e" stroke-width="3"/><rect x="17" y="40" width="46" height="26" rx="3" fill="#dfc783"/><path d="M40 44Q23 61 40 62Q56 60 40 44Z" fill="#9d7f37"/></g>`
};

for (const [name, body] of Object.entries(sprites)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="90" viewBox="0 0 240 90"><!-- Original M2D demo artwork. MIT; see LICENSE. --><defs><linearGradient id="bread" x2="0" y2="1"><stop stop-color="#eec577"/><stop offset="1" stop-color="#bc7839"/></linearGradient></defs>${body}</svg>\n`;
  writeFileSync(new URL(`${name}.svg`, output), svg);
}
console.log(`Generated ${Object.keys(sprites).length} original Doner sprites in ${fileURLToPath(output)}`);
