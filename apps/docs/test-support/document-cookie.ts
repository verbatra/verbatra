export function writeDocumentCookie(assignment: string): void {
  // biome-ignore lint/suspicious/noDocumentCookie: jsdom tests set the choice cookie the way a browser stores it
  document.cookie = assignment;
}

export function setDocumentCookie(name: string, value: string): void {
  writeDocumentCookie(`${name}=${value}; Path=/`);
}

export function clearDocumentCookie(name: string): void {
  writeDocumentCookie(`${name}=; Max-Age=0; Path=/`);
}
