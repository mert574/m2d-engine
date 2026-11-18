/**
 * The kit loads neither the DOM nor Node's library (tsconfig.json says
 * why), so the one host global it uses is declared here, with only the
 * method it calls. Every runtime the kit runs in — a browser, a server,
 * the editor — has it.
 */
declare const console: {
  warn(...data: unknown[]): void;
};
