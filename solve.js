// A fast drop-in replacement for csv-reader 1.0.0: run(input) returns exactly
// csv-reader's reading of {text, header} — {columns, rows, errors} — under its
// broken-row policy, but reads with slice-based scanning instead of one
// character at a time.
//
// Policy (identical to the reference):
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled,
//     "" inside it one quote and each CRLF or lone CR inside it read as LF; what
//     follows its closing quote, up to the next comma or line break, is appended
//     as it stands (quote_junk, when the field ends); a quote that never closes
//     is a literal character and the text after it is read again as unquoted
//     (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds the
//     records after it, each padded with "" (short_row) or cut (long_row) to the
//     first record's width;
//   - each error is {code, line, row}: line the 1-based line its record starts
//     on (every LF, CRLF and lone CR inside quotes counted), row its record's
//     index in rows (null for the header), in the order met.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const N = text.length;

  let pos = 0;
  let line = 1;
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The next comma / LF / CR at or after the last place we looked, one
  // cursor per character: a position, -1 for "none left in the text"
  // (sticky: pos only moves forward overall, so once a scan from an
  // earlier position found nothing, no later position can find anything),
  // -2 for unknown. Remembering the cursors keeps every delimiter scan
  // amortised: on an LF-only text the CR scan to the end happens once,
  // not once per field, and likewise for commas on a comma-free text.
  let commaNext = -2;
  let lfNext = -2;
  let crNext = -2;
  function nextComma(from) {
    if (commaNext === -1) return -1;
    if (commaNext >= from) return commaNext;
    commaNext = text.indexOf(',', from);
    return commaNext;
  }
  function nextLf(from) {
    if (lfNext === -1) return -1;
    if (lfNext >= from) return lfNext;
    lfNext = text.indexOf('\n', from);
    return lfNext;
  }
  function nextCr(from) {
    if (crNext === -1) return -1;
    if (crNext >= from) return crNext;
    crNext = text.indexOf('\r', from);
    return crNext;
  }

  let recordLine = 1;
  let recordRow = null;

  // Reads unquoted characters starting at pos onto `prefix`, up to the next
  // comma or line break. Stray CRs are dropped (stray_cr). Returns
  // [value, ended, added]; `added` counts the characters kept from the text
  // itself (the prefix is not counted).
  function readUnquoted(prefix) {
    let parts = null;
    let segStart = pos;
    let added = 0;
    let ended = END;
    let segFinalEnd = N;
    while (true) {
      if (pos >= N) {
        ended = END;
        segFinalEnd = N;
        break;
      }
      // Find the next special character from pos.
      let next = -1;
      let kind = -1;
      const iComma = nextComma(pos);
      const iLf = nextLf(pos);
      const iCr = nextCr(pos);
      if (iComma !== -1) { next = iComma; kind = 44; }
      if (iLf !== -1 && (next === -1 || iLf < next)) { next = iLf; kind = 10; }
      if (iCr !== -1 && (next === -1 || iCr < next)) { next = iCr; kind = 13; }
      if (next === -1) {
        added += N - segStart;
        pos = N;
        ended = END;
        segFinalEnd = N;
        break;
      }
      if (kind === 44) {
        added += next - segStart;
        segFinalEnd = next;
        pos = next + 1;
        ended = COMMA;
        break;
      }
      if (kind === 10) {
        added += next - segStart;
        segFinalEnd = next;
        pos = next + 1;
        line += 1;
        ended = LINE_BREAK;
        break;
      }
      // kind === 13: a CR.
      if (text.charCodeAt(next + 1) === 10) {
        added += next - segStart;
        segFinalEnd = next;
        pos = next + 2;
        line += 1;
        ended = LINE_BREAK;
        break;
      }
      // A stray CR: keep the segment before it, drop it, read on.
      if (parts === null) parts = [];
      parts.push(text.slice(segStart, next));
      added += next - segStart;
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      pos = next + 1;
      segStart = pos;
    }
    if (parts === null) {
      return [prefix + text.slice(segStart, segFinalEnd), ended, added];
    }
    parts.push(text.slice(segStart, segFinalEnd));
    return [prefix + parts.join(''), ended, added];
  }

  // Positions from which a scan has already proved "no such character in
  // the rest of the text": a query starting at or after the recorded
  // position may treat the character as absent. (Position-aware, unlike
  // the readUnquoted cursors, because a quoted field that fails rewinds
  // pos to just after its opening quote.)
  let lfAbsentFrom = Infinity;
  let crAbsentFrom = Infinity;

  // Counts line breaks in text[from, to) the way the reference counts them
  // inside a quoted field: each LF is one, each CRLF is one, each lone CR is
  // one. Also reports whether the segment holds any CR (needs conversion).
  // The scans consult the absence proofs above (and the readUnquoted
  // cursors' sticky -1, whose proofs start no later than the current
  // field): without them, on a text with no CRs every quoted segment would
  // pay a scan to the end of the text.
  function countBreaks(from, to) {
    let breaks = 0;
    let hasCr = false;
    if (from < lfAbsentFrom && lfNext !== -1) {
      let i = text.indexOf('\n', from);
      if (i === -1) {
        lfAbsentFrom = from;
      }
      while (i !== -1 && i < to) {
        breaks += 1;
        const ni = text.indexOf('\n', i + 1);
        if (ni === -1 && i + 1 < lfAbsentFrom) lfAbsentFrom = i + 1;
        i = ni;
      }
    }
    if (from < crAbsentFrom && crNext !== -1) {
      let i = text.indexOf('\r', from);
      if (i === -1) {
        crAbsentFrom = from;
      }
      while (i !== -1 && i < to) {
        hasCr = true;
        if (text.charCodeAt(i + 1) !== 10) breaks += 1;
        const ni = text.indexOf('\r', i + 1);
        if (ni === -1 && i + 1 < crAbsentFrom) crAbsentFrom = i + 1;
        i = ni;
      }
    }
    return [breaks, hasCr];
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let parts = null;
    let segStart = pos;
    let value = null;
    let closed = false;
    while (true) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        pos = N;
        break;
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote: one literal quote; the segment before it is kept.
        if (parts === null) parts = [];
        parts.push(convert(segStart, q));
        parts.push('"');
        pos = q + 2;
        segStart = pos;
        continue;
      }
      // The closing quote.
      if (parts === null) {
        value = convert(segStart, q);
      } else {
        parts.push(convert(segStart, q));
        value = parts.join('');
      }
      pos = q + 1;
      closed = true;
      break;
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text after
      // it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      return readUnquoted('"');
    }
    if (pos >= N) return [value, END, 0];
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return [value, COMMA, 0];
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return [value, LINE_BREAK, 0];
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return [value, LINE_BREAK, 0];
    }
    // What follows the closing quote is appended as it stands.
    const junk = readUnquoted(value);
    if (junk[2] > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return junk;

    // The segment text[from, to) of a quoted field, with CRLF and lone CR
    // read as LF, and the line counter advanced past its breaks.
    function convert(from, to) {
      if (from === to) return '';
      const [breaks, hasCr] = countBreaks(from, to);
      line += breaks;
      if (!hasCr) return text.slice(from, to);
      return text.slice(from, to).replace(/\r\n|\r/g, '\n');
    }
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < N) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= N) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let field;
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field[0]);
    } while (field[1] === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
