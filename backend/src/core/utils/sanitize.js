// Strip HTML tags from a string — use for plain-text fields like titles and names.
// Descriptions and comments are plain text in this app (React renders them as text nodes),
// but stripping tags here prevents future stored-XSS if rendering ever changes.
export function stripHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '').trim();
}
