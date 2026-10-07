// Comments in Python source; Skulpt's syntax tree has none.

// `text` is what follows `#`, without one leading space and without trailing spaces (so `# go` ↔ «go»).
// `trailing`: the comment ends a line of code.
export interface Comment { line: number; text: string; trailing: boolean }

// A `#` inside a string, including a triple-quoted string over several lines, is not a comment.
export function scanComments(source: string): Comment[] {
  const comments: Comment[] = [];
  let line = 1;
  let lineHasCode = false;
  let quote = ''; // the quote that ends the current string: ', ", ''' or """
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '\n') {
      line++;
      lineHasCode = false;
    } else if (quote) {
      lineHasCode = true;
      if (c === '\\' && source[i + 1] !== '\n') i++;
      else if (source.startsWith(quote, i)) {
        i += quote.length - 1;
        quote = '';
      }
    } else if (c === '#') {
      const end = source.indexOf('\n', i) === -1 ? source.length : source.indexOf('\n', i);
      comments.push({ line, text: source.slice(i + 1, end).replace(/^ /, '').trimEnd(), trailing: lineHasCode });
      i = end - 1;
    } else if (c === '"' || c === "'") {
      quote = source.startsWith(c.repeat(3), i) ? c.repeat(3) : c;
      i += quote.length - 1;
      lineHasCode = true;
    } else if (c.trim()) {
      lineHasCode = true;
    }
  }
  return comments;
}
