/** Vite `?raw` imports: file contents as a string, inlined at build time. */
declare module "*?raw" {
  const content: string;
  export default content;
}
