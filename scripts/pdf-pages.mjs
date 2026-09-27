/** Page objects in a PDF read as latin1: `/Type /Page`, not `/Pages`. */
export const pdfPageCount = (bytes) =>
  bytes.match(/\/Type\s*\/Page(?![s\w])/g)?.length ?? 0;
