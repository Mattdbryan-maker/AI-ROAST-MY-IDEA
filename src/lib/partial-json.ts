/**
 * Parses a *prefix* of a JSON document — e.g. a model response that is still
 * streaming — into the value it describes so far.
 *
 * Unfinished strings keep the text received so far; unfinished numbers and
 * literals are dropped; unfinished keys are dropped. Every value that was
 * still open when the input ran out is reported in `open` by its dotted path
 * ("takes.0.headline", "takes.0", "takes", ""), which tells callers exactly
 * which parts are final.
 */

export interface PartialJson {
  value: unknown;
  /** Dotted paths of values that were not yet closed. "" is the root. */
  open: Set<string>;
}

class EndOfInput extends Error {}

export function parsePartialJson(text: string): PartialJson {
  const open = new Set<string>();
  let i = 0;

  const join = (path: string, key: string | number) => (path === "" ? String(key) : `${path}.${key}`);
  const ws = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };

  function parseString(path: string): string {
    // Assumes text[i] === '"'.
    i++;
    let out = "";
    while (i < text.length) {
      const ch = text[i];
      if (ch === '"') {
        i++;
        return out;
      }
      if (ch === "\\") {
        const next = text[i + 1];
        if (next === undefined) break;
        if (next === "u") {
          const hex = text.slice(i + 2, i + 6);
          if (hex.length < 4) break;
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
          continue;
        }
        const map: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", '"': '"', "\\": "\\", "/": "/" };
        out += map[next] ?? next;
        i += 2;
        continue;
      }
      out += ch;
      i++;
    }
    open.add(path);
    i = text.length;
    return out;
  }

  function parseValue(path: string): unknown {
    ws();
    if (i >= text.length) throw new EndOfInput();
    const ch = text[i];
    if (ch === "{") return parseObject(path);
    if (ch === "[") return parseArray(path);
    if (ch === '"') return parseString(path);
    const literal = text.slice(i).match(/^(true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
    if (!literal) throw new EndOfInput();
    const token = literal[1];
    // A token that runs to the very end of the input may still be growing ("7" of "72", "tr" of "true").
    if (i + token.length >= text.length) throw new EndOfInput();
    i += token.length;
    return token === "true" ? true : token === "false" ? false : token === "null" ? null : Number(token);
  }

  function parseObject(path: string): Record<string, unknown> {
    i++;
    const obj: Record<string, unknown> = {};
    try {
      for (;;) {
        ws();
        if (i >= text.length) throw new EndOfInput();
        if (text[i] === "}") {
          i++;
          return obj;
        }
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] !== '"') throw new EndOfInput();
        // An unfinished key is useless; stop here.
        const keyPath = join(path, "\u0000key");
        const key = parseString(keyPath);
        if (open.delete(keyPath)) throw new EndOfInput();
        ws();
        if (text[i] !== ":") throw new EndOfInput();
        i++;
        obj[key] = parseValue(join(path, key));
      }
    } catch (err) {
      if (err instanceof EndOfInput) {
        open.add(path);
        return obj;
      }
      throw err;
    }
  }

  function parseArray(path: string): unknown[] {
    i++;
    const arr: unknown[] = [];
    try {
      for (;;) {
        ws();
        if (i >= text.length) throw new EndOfInput();
        if (text[i] === "]") {
          i++;
          return arr;
        }
        if (text[i] === ",") {
          i++;
          continue;
        }
        arr.push(parseValue(join(path, arr.length)));
      }
    } catch (err) {
      if (err instanceof EndOfInput) {
        open.add(path);
        return arr;
      }
      throw err;
    }
  }

  let value: unknown;
  try {
    value = parseValue("");
  } catch (err) {
    if (!(err instanceof EndOfInput)) throw err;
    value = undefined;
    open.add("");
  }
  return { value, open };
}
