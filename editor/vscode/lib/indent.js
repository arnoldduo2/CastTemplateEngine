"use strict";
/**
 * Indentation for .cast.php views: HTML tags, component tags (<Card>, <Btns.Button />), PHP alternative syntax
 * (`<?php if (x): ?> ... <?php endif ?>`, braces, multi-line `<?php ... ?>` blocks) and the engine's @ directives
 * (@if ... @endif, @foreach, @forelse/@empty, @switch/@case, @php ... @endphp).
 *
 * It only ever changes the leading whitespace of a line. Lines inside <script>, <style>, <pre>, <textarea>, HTML comments and
 * heredocs are left exactly as they are. Markup that is opened and closed in different `@if` branches is tolerated: a closer
 * that matches nothing is ignored and a closer pops everything opened after its opener.
 *
 * No dependency on the `vscode` module, so it is unit tested with node --test.
 */

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr", "!doctype"]);
const RAW = new Set(["script", "style", "pre", "textarea"]);
const OPEN_DIRECTIVES = new Set(["if", "unless", "isset", "for", "foreach", "forelse", "while", "switch"]);
const MIDDLE_DIRECTIVES = { elseif: "if", else: "if", empty: "forelse" };
const END_DIRECTIVES = { endif: ["if", "unless", "isset"], endunless: ["unless"], endisset: ["isset"], endfor: ["for"], endforeach: ["foreach"], endforelse: ["forelse"], endwhile: ["while"], endswitch: ["switch"] };
const PHP_ALT_OPEN = /^(if|foreach|for|while|switch)\b/;
const PHP_ALT_END = { endif: "if", endforeach: "foreach", endfor: "for", endwhile: "while", endswitch: "switch" };

/** Walks the text of every line once and keeps the nesting between lines. */
class Scanner {
  constructor(seed = []) {
    this.stack = [];
    this.pending = seed; // tags another file opened: they become real at the first closing tag that matches the innermost one
    this.unmatched = []; // closing tags that closed nothing
    this.ambiguous = false; // a closer dropped open tags: the nesting cannot be trusted to seed from
    this.mode = "html"; // html | php | comment | raw | heredoc | tag
    this.rawEnd = null; // RegExp that ends raw / comment / heredoc text
    this.tag = null; // {name, quote, brace}: a tag whose attributes continue on the next line
    this.rawKeep = false;
  }

  depth() {
    return this.stack.length;
  }

  push(kind, name = "") {
    this.stack.push({ kind, name });
  }

  /** Pop up to and including the nearest entry that matches; nothing happens when none does. */
  popTo(match) {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (match(this.stack[i])) {
        if (this.stack.slice(i + 1).some((e) => e.kind === "html")) this.ambiguous = true;
        this.stack.length = i;
        return true;
      }
    }
    return false;
  }

  /** @returns {{depth: number|null, after: number}} depth null = leave the line alone */
  line(text) {
    const startMode = this.mode;
    const ctx = { depth: null, leading: true, text };
    // a line that continues raw text, a comment or a heredoc keeps its indentation, until the text ends
    let i = 0;
    if (this.mode === "raw" || this.mode === "comment" || this.mode === "heredoc") {
      const m = this.rawEnd.exec(text);
      if (!m) return { depth: null, after: this.depth() };
      i = m.index;
      this.mode = "html";
      this.rawEnd = null;
      // the line that ends a comment, a heredoc, <pre> or <textarea> is part of that text; one that ends <script> or <style> is a closing tag
      ctx.keep = startMode !== "raw" || this.rawKeep;
    }
    this.scan(text, i, ctx);
    if (ctx.depth === null) ctx.depth = this.depth();
    if (/^\s*$/.test(text)) return { depth: null, after: this.depth(), blank: true };
    if (ctx.keep) return { depth: null, after: this.depth() };
    return { depth: ctx.depth, after: this.depth() };
  }

  /** Marks the indent of the line: the stack depth at the first thing that is not a closer. */
  content(ctx) {
    if (ctx.depth === null) ctx.depth = this.depth();
    ctx.leading = false;
  }

  scan(text, i, ctx) {
    const n = text.length;
    while (i < n) {
      if (this.mode === "tag") {
        i = this.scanTagBody(text, i, ctx);
        continue;
      }
      if (this.mode === "php") {
        i = this.scanPhp(text, i, ctx);
        continue;
      }
      if (this.mode === "raw" || this.mode === "comment" || this.mode === "heredoc") {
        const m = this.rawEnd.exec(text.slice(i));
        if (!m) {
          this.content(ctx);
          return;
        }
        i += m.index;
        this.mode = "html";
        this.rawEnd = null;
        continue;
      }
      const ch = text[i];
      if (ch === "<") {
        if (text.startsWith("<?", i)) {
          const eq = text.startsWith("<?=", i);
          i += eq ? 3 : text.startsWith("<?php", i) ? 5 : 2;
          this.mode = "php";
          continue; // the first thing inside decides the indent: `<?php endif ?>` is a closer, `<?php foreach ... : ?>` is content
        }
        if (text.startsWith("<!--", i)) {
          this.content(ctx);
          const end = text.indexOf("-->", i + 4);
          if (end === -1) {
            this.mode = "comment";
            this.rawEnd = /-->/;
            ctx.keep = true;
            return;
          }
          i = end + 3;
          continue;
        }
        const close = /^<\/([A-Za-z][\w.:-]*)\s*>/.exec(text.slice(i));
        if (close) {
          this.closeTag(close[1], ctx);
          i += close[0].length;
          continue;
        }
        const open = /^<([A-Za-z][\w.:-]*|!DOCTYPE)/i.exec(text.slice(i));
        if (open) {
          this.content(ctx);
          ctx.leading = false;
          this.tag = { name: open[1], quote: null, brace: 0 };
          this.mode = "tag";
          i += open[0].length;
          continue;
        }
      } else if (ch === "@") {
        const consumed = this.directive(text, i, ctx);
        if (consumed) {
          i += consumed;
          continue;
        }
      }
      if (ch !== " " && ch !== "\t") this.content(ctx);
      i++;
    }
  }

  closeTag(name, ctx) {
    const lower = name.toLowerCase();
    const match = (e) => e.kind === "html" && e.name === lower;
    if (this.popTo(match)) return;
    if (this.pending.length && this.pending[this.pending.length - 1] === lower) {
      this.stack = [...this.pending.map((name) => ({ kind: "html", name })), ...this.stack];
      this.pending = [];
      this.popTo(match);
    } else if (lower !== "html") {
      this.unmatched.push(lower);
    }
  }

  /** Reads attributes up to the `>`, across lines when needed. */
  scanTagBody(text, i, ctx) {
    const t = this.tag;
    const n = text.length;
    for (; i < n; i++) {
      const c = text[i];
      if (t.quote) {
        if (c === "\\") i++;
        else if (c === t.quote) t.quote = null;
        continue;
      }
      if (t.brace > 0) {
        if (c === '"' || c === "'") t.quote = c;
        else if (c === "{") t.brace++;
        else if (c === "}") t.brace--;
        continue;
      }
      if (c === '"' || c === "'") t.quote = c;
      else if (c === "{") t.brace++;
      else if (c === "<" && text.startsWith("<?", i)) {
        const end = text.indexOf("?>", i);
        if (end !== -1) i = end + 1;
      } else if (c === "@" && text.startsWith("@{", i)) {
        t.brace++;
        i++;
      } else if (c === ">") {
        const selfClosing = text[i - 1] === "/";
        this.tag = null;
        this.mode = "html";
        if (t.entered) {
          this.stack.pop(); // the continuation level of a multi-line tag: the `>` line is back at the tag's own level
          if (ctx.depth === null) ctx.depth = this.depth();
        }
        this.afterOpen(t, selfClosing, text, i + 1);
        return i + 1;
      }
    }
    // the tag goes on in the next line: its attributes are indented one level
    if (!t.entered) {
      t.entered = true;
      this.push("tagbody");
    }
    return n;
  }

  afterOpen(t, selfClosing, text, from) {
    const lower = t.name.toLowerCase();
    if (selfClosing || VOID.has(lower) || lower === "html") return; // <html>'s children stay at its level, as in most layouts
    this.push("html", lower);
    if (RAW.has(lower)) {
      const rest = text.slice(from);
      const closer = new RegExp("</" + lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*>", "i");
      if (!closer.test(rest)) {
        this.mode = "raw";
        this.rawKeep = lower === "pre" || lower === "textarea"; // whitespace before </pre> is content
        this.rawEnd = new RegExp("</" + lower + "\\s*>", "i");
      } else {
        // `<script>...</script>` on one line: leave the rest to the normal scan, which pops it at the closer
      }
    }
  }

  /** An @ directive at `i`: the number of characters consumed, or 0 when it is not one. */
  directive(text, i, ctx) {
    if (text.startsWith("@@", i)) return 2;
    if (text.startsWith("@{", i)) {
      this.content(ctx);
      let depth = 0;
      for (let j = i + 1; j < text.length; j++) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}" && --depth === 0) return j + 1 - i;
      }
      return text.length - i;
    }
    const before = i > 0 ? text[i - 1] : "";
    if (before && /[\w.]/.test(before)) return 0;
    const m = /^@(forelse|foreach|elseif|endforelse|endforeach|endswitch|endunless|endisset|endwhile|endphp|endfor|endif|switch|unless|isset|default|empty|else|case|for|while|if|php|break|continue)\b/.exec(text.slice(i));
    if (!m) return 0;
    const word = m[1];
    let length = m[0].length;
    // the parenthesised argument, to know whether @php is a block and to skip nested parentheses
    let j = i + length;
    let hasArgs = false;
    const space = /^[ \t]*\(/.exec(text.slice(j));
    if (space) {
      let depth = 0;
      let quote = null;
      for (let k = j + space[0].length - 1; k < text.length; k++) {
        const c = text[k];
        if (quote) {
          if (c === "\\") k++;
          else if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === "(") depth++;
        else if (c === ")" && --depth === 0) {
          length = k + 1 - i;
          hasArgs = true;
          break;
        }
      }
      if (!hasArgs) length = text.length - i; // the arguments go on in the next line; good enough
    }

    if (OPEN_DIRECTIVES.has(word)) {
      this.content(ctx);
      this.push("dir", word);
    } else if (word === "php") {
      if (!hasArgs) {
        this.content(ctx);
        this.push("dir", "php");
        // the code of an @php block is not ours to move
        const end = /@endphp\b/.exec(text.slice(i + length));
        if (end) this.popTo((e) => e.kind === "dir" && e.name === "php");
        else {
          this.mode = "raw";
          this.rawKeep = false;
          this.rawEnd = /@endphp\b/;
        }
      } else {
        this.content(ctx);
      }
    } else if (word === "endphp") {
      this.popTo((e) => e.kind === "dir" && e.name === "php");
    } else if (MIDDLE_DIRECTIVES[word]) {
      const target = MIDDLE_DIRECTIVES[word];
      const kinds = target === "if" ? ["if", "unless", "isset"] : [target];
      let name = target;
      for (let k = this.stack.length - 1; k >= 0; k--) {
        if (this.stack[k].kind === "dir" && kinds.includes(this.stack[k].name)) {
          name = this.stack[k].name;
          break;
        }
      }
      if (this.popTo((e) => e.kind === "dir" && kinds.includes(e.name))) {
        if (ctx.depth === null) ctx.depth = this.depth();
        this.push("dir", name);
      }
      ctx.leading = false;
    } else if (word === "case" || word === "default") {
      // @case lines sit one level inside @switch, their bodies one level further
      const top = this.stack[this.stack.length - 1];
      if (top && top.kind === "dir" && top.name === "case") this.stack.pop();
      if (ctx.depth === null) ctx.depth = this.depth();
      ctx.leading = false;
      this.push("dir", "case");
    } else if (END_DIRECTIVES[word]) {
      this.popTo((e) => e.kind === "dir" && END_DIRECTIVES[word].includes(e.name)); // also drops an open @case
    } else {
      this.content(ctx); // @break, @continue
    }
    return length;
  }

  /** PHP code up to `?>`. */
  scanPhp(text, i, ctx) {
    const n = text.length;
    let word = "";
    for (; i < n; i++) {
      const c = text[i];
      if (c === "?" && text[i + 1] === ">") {
        if (ctx.depth === null) ctx.depth = this.depth(); // a line that is only `?>` sits at the level of `<?php`
        this.mode = "html";
        return i + 2;
      }
      if (c === "'" || c === '"') {
        this.content(ctx);
        for (i++; i < n && text[i] !== c; i++) if (text[i] === "\\") i++;
        continue;
      }
      if (c === "/" && text[i + 1] === "/") {
        this.content(ctx);
        const end = text.indexOf("?>", i);
        if (end === -1) return n;
        i = end - 1;
        continue;
      }
      if (c === "#" && text[i + 1] !== "[") {
        this.content(ctx);
        const end = text.indexOf("?>", i);
        if (end === -1) return n;
        i = end - 1;
        continue;
      }
      if (c === "/" && text[i + 1] === "*") {
        this.content(ctx);
        const end = text.indexOf("*/", i + 2);
        if (end === -1) {
          this.mode = "heredoc";
          this.rawEnd = /\*\//;
          return n;
        }
        i = end + 1;
        continue;
      }
      if (c === "<" && text.startsWith("<<<", i)) {
        const m = /^<<<\s*['"]?(\w+)['"]?\s*$/.exec(text.slice(i));
        if (m) {
          this.content(ctx);
          this.mode = "heredoc";
          this.rawEnd = new RegExp("^\\s*" + m[1] + "\\b");
          return n;
        }
      }
      if (c === "{") {
        this.content(ctx);
        this.push("brace");
      } else if (c === "}") {
        this.popTo((e) => e.kind === "brace");
        if (ctx.depth === null) ctx.depth = this.depth();
        ctx.leading = false;
      } else if (c === "(" || c === "[") {
        this.content(ctx);
        this.push("paren");
      } else if (c === ")" || c === "]") {
        this.popTo((e) => e.kind === "paren");
        if (ctx.depth === null) ctx.depth = this.depth();
        ctx.leading = false;
      } else if (/[A-Za-z_]/.test(c)) {
        const m = /^[A-Za-z_]\w*/.exec(text.slice(i));
        const w = m[0];
        const prev = i > 0 ? text[i - 1] : "";
        if (prev !== "$" && prev !== ">" && prev !== ":") {
          const lw = w.toLowerCase();
          const rest = text.slice(i + w.length);
          if (PHP_ALT_END[lw] && /^\s*;?/.test(rest)) {
            this.popTo((e) => e.kind === "alt");
            if (ctx.depth === null) ctx.depth = this.depth();
            ctx.leading = false;
          } else if (lw === "else" && /^\s*:(?!:)/.test(rest)) {
            this.popTo((e) => e.kind === "alt");
            if (ctx.depth === null) ctx.depth = this.depth();
            ctx.leading = false;
            this.push("alt");
          } else if ((lw === "case" || lw === "default") && this.insideAltSwitch()) {
            const top = this.stack[this.stack.length - 1];
            if (top && top.kind === "casephp") this.stack.pop();
            if (ctx.depth === null) ctx.depth = this.depth();
            ctx.leading = false;
            this.push("casephp");
          } else if ((PHP_ALT_OPEN.test(lw + " ") || lw === "elseif") && this.altColon(text, i + w.length)) {
            if (lw === "elseif") {
              this.popTo((e) => e.kind === "alt");
              if (ctx.depth === null) ctx.depth = this.depth();
              ctx.leading = false;
            } else {
              this.content(ctx);
            }
            this.push("alt");
            // skip to the colon so the parentheses do not count again
            i = this.skipParens(text, i + w.length);
            continue;
          } else {
            this.content(ctx);
          }
        } else {
          this.content(ctx);
        }
        i += w.length - 1;
      } else if (c !== " " && c !== "\t") {
        this.content(ctx);
      }
    }
    return n;
  }

  insideAltSwitch() {
    return this.stack.some((e) => e.kind === "alt" && e.name === "switch") || this.stack.some((e) => e.kind === "brace");
  }

  /** After a keyword: `(...)` then a colon? */
  altColon(text, from) {
    const end = this.skipParens(text, from);
    return end > from && /^\s*:(?!:)/.test(text.slice(end));
  }

  /** Index just after the balanced parentheses that start at `from` (after optional spaces), or `from`. */
  skipParens(text, from) {
    let k = from;
    while (text[k] === " " || text[k] === "\t") k++;
    if (text[k] !== "(") return from;
    let depth = 0;
    let quote = null;
    for (; k < text.length; k++) {
      const c = text[k];
      if (quote) {
        if (c === "\\") k++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === "(") depth++;
      else if (c === ")" && --depth === 0) return k + 1;
    }
    return from; // the parentheses go on in the next line
  }
}

/** Depth of every line (null = leave it alone) and the depth after each line. */
function computeIndents(lines) {
  const run = (seed) => {
    const scanner = new Scanner(seed);
    const depths = [];
    const after = [];
    for (const line of lines) {
      const r = scanner.line(line);
      depths.push(r.depth);
      after.push(r.after);
    }
    return { depths, after, scanner };
  };
  const first = run([]);
  // a view that closes tags it did not open (layouts/footer closes what layouts/header opened) is indented as if it started inside them
  if (first.scanner.unmatched.length && !first.scanner.ambiguous && first.scanner.unmatched.length <= 6) {
    const seeded = run([...first.scanner.unmatched].reverse());
    return { depths: seeded.depths, after: seeded.after };
  }
  return { depths: first.depths, after: first.after };
}

function indentString(depth, { tabSize = 4, insertSpaces = true } = {}) {
  return insertSpaces ? " ".repeat(tabSize * depth) : "\t".repeat(depth);
}

/** The text with every line re-indented. @returns {string} */
function formatText(text, options = {}) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const { depths } = computeIndents(lines);
  return lines
    .map((line, i) => {
      if (/^\s*$/.test(line)) return "";
      if (depths[i] === null) return line;
      return indentString(depths[i], options) + line.replace(/^[ \t]+/, "");
    })
    .join(eol);
}

/** The indentation a line should have, given the lines above it (and itself). @returns {string|null} null: leave it */
function indentFor(lines, index, options = {}) {
  const { depths, after } = computeIndents(lines.slice(0, index + 1));
  if (/^\s*$/.test(lines[index] ?? "")) return indentString(index > 0 ? after[index - 1] : 0, options);
  return depths[index] === null ? null : indentString(depths[index], options);
}

module.exports = { computeIndents, formatText, indentFor, indentString };
