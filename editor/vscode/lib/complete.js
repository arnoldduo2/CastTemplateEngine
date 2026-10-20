"use strict";
/**
 * Completion contexts and diagnostics for component tags: pure functions on text and specs, no VS Code API.
 */
const { scanComponents } = require("./scan");
const { camel } = require("./docblock");
const { findProp } = require("./components");
const { parsePropsBlock } = require("./propsBlock");

/**
 * contextAt/parentOf ("what is being typed at this offset": a tag name, an attribute name, an attribute value, or
 * a <Slot name="...">) are a compatibility facade over cast-language-core now - ported there for Task 8 of the
 * Cast LSP Precedence plan (editor/language-core/src/completionContext.ts), so the LSP's CompletionProvider shares
 * the exact scan instead of a second, independently-drifted copy. Guarded the same way lib/docblock.js's require
 * is (see that file's comment): on failure, contextAt simply finds nothing (no completions), rather than taking
 * the whole extension down.
 */
let core;
try {
  core = require("cast-language-core");
} catch {
  core = null;
}
const contextAt = core ? core.contextAt : () => null;
const parentOf = core ? core.parentOf : () => null;

/**
 * Problems in the opening tags of documented components.
 * @param {string} src
 * @param {(tag: string) => ({file: string, spec: object}|null)} lookup
 * @returns {{start: number, end: number, message: string, kind: string, tag: string, prop?: string, values?: string[], suggestion?: string, missing?: string[], insertAt?: number}[]}
 */
function diagnose(src, lookup) {
  const problems = [];

  const KNOWN_DIRECTIVES = new Set([
    "for", "foreach", "forelse", "while", "if", "elseif", "else", "endif", "endfor", "endforeach",
    "endwhile", "endforelse", "unless", "endunless", "isset", "endisset", "switch", "case", "default",
    "endswitch", "php", "endphp", "break", "continue", "empty", "map", "filter",
    "script", "js", "css", "scripts", "styles",
    // framework-helper directives - keep this in sync with Directives::FUNCTION_DIRECTIVES (vendor/anode/cast-template-engine/src/Directives.php)
    "htchars", "route", "cast", "csrf", "alerts", "modules", "includes",
  ]);
  const CSS_RULES = new Set([
    "media", "import", "keyframes", "charset", "font-face", "supports", "page", "namespace",
    "layer", "container", "property", "scope", "starting-style", "view-transition"
  ]);

  // 1. Directive Validation
  const directiveRegex = /@([A-Za-z0-9_]+)(?:\.([A-Za-z0-9_]+))?(?:\s*\()?/g;
  let dm;
  while ((dm = directiveRegex.exec(src)) !== null) {
    const word = dm[1];
    const chained = dm[2];
    const fullMatch = dm[0];
    const index = dm.index;

    if (index > 0 && src[index - 1] === "@") continue;
    if (index > 0 && /[a-zA-Z0-9_.]/.test(src[index - 1])) continue;
    if (CSS_RULES.has(word.toLowerCase())) continue;

    if (chained) {
      if (chained !== "map" && chained !== "filter") {
        problems.push({
          start: index, end: index + fullMatch.length, kind: "unknown-directive", severity: "error",
          message: `Unknown chained collection method ".${chained}" on "@${word}"`
        });
      }
      continue;
    }

    if (fullMatch.includes("(") || word.startsWith("end")) {
      if (!KNOWN_DIRECTIVES.has(word)) {
        problems.push({
          start: index, end: index + 1 + word.length, kind: "unknown-directive", severity: "error",
          message: `Unknown directive "@${word}"`
        });
      }
    }
  }

  // 1b. Style consistency: mixing <?= ?> and @{ } for plain output across sibling leaf tags (e.g. a run of <td>
  // cells) is confusing - not wrong, both compile the same way, but a reader has to wonder why one differs.
  // Flagged only within a contiguous run of simple `<tag>ECHO</tag>` siblings (nothing but whitespace between one's
  // closing tag and the next's opening tag): unrelated uses elsewhere in the file are never flagged.
  const leafEcho = /<([A-Za-z][\w-]*)>\s*(?:(<\?=\s*[^?]*?\s*\?>)|(@\{[^{}]*\}))\s*<\/\1>/g;
  let lm;
  let run = [];
  const flushRun = () => {
    if (run.length < 2) {
      run = [];
      return;
    }
    const styles = new Set(run.map((r) => r.style));
    if (styles.size > 1) {
      const majority = run.filter((r) => r.style === "<?= ?>").length >= run.filter((r) => r.style === "@{ }").length ? "<?= ?>" : "@{ }";
      for (const r of run) {
        if (r.style !== majority) {
          problems.push({
            start: r.start, end: r.end, kind: "mixed-echo-style", severity: "hint",
            message: `Mixes "${r.style}" with "${majority}" used on the sibling tags right around it - pick one style for a run like this`,
          });
        }
      }
    }
    run = [];
  };
  let lastEnd = null;
  while ((lm = leafEcho.exec(src)) !== null) {
    const style = lm[2] ? "<?= ?>" : "@{ }";
    const exprStart = lm.index + lm[0].indexOf(lm[2] || lm[3]);
    const entry = { start: exprStart, end: exprStart + (lm[2] || lm[3]).length, style };
    if (lastEnd !== null && src.slice(lastEnd, lm.index).trim() !== "") flushRun();
    run.push(entry);
    lastEnd = lm.index + lm[0].length;
  }
  flushRun();

  // 2. Tag Matching
  const tagStack = [];
  const scanned = scanComponents(src);
  for (const ref of scanned) {
    if (ref.name === "Slot" || ref.selfClosing) continue;
    if (ref.closing) {
      const last = tagStack.pop();
      if (!last || last.name !== ref.name) {
        problems.push({
          start: ref.start, end: ref.end, kind: "mismatched-tag", severity: "error",
          message: `Unexpected closing tag </${ref.name}>${last ? ` (expected </${last.name}>)` : ""}`
        });
      }
    } else {
      tagStack.push(ref);
    }
  }
  for (const unclosed of tagStack) {
    problems.push({
      start: unclosed.start, end: unclosed.end, kind: "unclosed-tag", severity: "error",
      message: `<${unclosed.name}> is never closed`
    });
  }

  // 3. Missing Key Detection in @map / @filter
  const mapRegex = /(?:@map|@filter|\.map)\s*\([^)]*=>\s*(?:return\s*\(?|\()?\s*<([A-Za-z0-9_\-.:]+)([^>]*)/g;
  let mm;
  while ((mm = mapRegex.exec(src)) !== null) {
    const tagName = mm[1];
    const attrs = mm[2];
    if (!/\b(?:key|data-el-key)\s*=/i.test(attrs)) {
      const tagStart = mm.index + mm[0].indexOf("<" + tagName);
      problems.push({
        start: tagStart, end: tagStart + tagName.length + 1, kind: "missing-key", severity: "warning",
        message: `Missing key: Provide a unique "key={...}" for mapped <${tagName}> to ensure stable identity and prevent UI glitches.`
      });
    }
  }

  // 4. Component Prop Diagnostics
  for (const ref of scanned) {
    if (ref.closing || ref.name === "Slot") continue;
    const found = lookup(ref.name);
    if (!found) continue;
    const { spec } = found;

    if (spec.deprecated) {
      problems.push({ start: ref.start, end: ref.end, kind: "deprecated", tag: ref.name, message: `<${ref.name}> is deprecated${spec.deprecated === true ? "" : ": " + spec.deprecated}` });
    }
    const documented = spec.props.filter((p) => !p.inferred);
    if (!documented.length) continue; // an undocumented component is never flagged

    const slotNames = new Set(spec.slots.map((s) => camel(s.name)));
    const hasSpread = ref.attrs.some((a) => a.valueType === "spread");

    for (const attr of ref.attrs) {
      if (!attr.name) continue;
      const prop = findProp(spec, attr.name);
      if (!prop) {
        if (slotNames.has(camel(attr.name))) continue;
        const suggestion = nearest(camel(attr.name), spec.props.map((p) => p.name));
        problems.push({
          start: attr.nameStart, end: attr.nameEnd, kind: "unknown", tag: ref.name, prop: attr.name, suggestion,
          message: `<${ref.name}> has no prop "${attr.name}"` + (suggestion ? `. Did you mean "${suggestion}"?` : ""),
        });
        continue;
      }
      if (prop.deprecated) {
        problems.push({ start: attr.nameStart, end: attr.nameEnd, kind: "deprecated-prop", tag: ref.name, prop: prop.name, message: `"${prop.name}" is deprecated${prop.deprecated === true ? "" : ": " + prop.deprecated}` });
      }
      if (attr.valueType === "string" && attr.valueEnd !== null && prop.values.length && prop.kind === "string") {
        const value = src.slice(attr.valueStart, attr.valueEnd);
        if (!value.includes("<?") && !prop.values.includes(value)) {
          problems.push({
            start: attr.valueStart, end: attr.valueEnd, kind: "value", tag: ref.name, prop: prop.name, values: prop.values,
            message: `"${value}" is not one of ${prop.values.map((v) => `"${v}"`).join(", ")} for "${prop.name}"`,
          });
        }
      }
    }

    if (!hasSpread && ref.tagEnd !== null) {
      const have = new Set(ref.attrs.filter((a) => a.name).map((a) => camel(a.name)));
      for (const s of slotNames) have.add(s);
      const missing = documented.filter((p) => p.required && !have.has(camel(p.name)) && !isProvidedBySlot(src, ref, p.name)).map((p) => p.name);
      if (missing.length) {
        problems.push({
          start: ref.start, end: ref.end, kind: "missing", tag: ref.name, missing, insertAt: ref.end,
          message: `<${ref.name}> needs ${missing.map((m) => `"${m}"`).join(", ")}`,
        });
      }
    }
  }

  // 5. @props{}: a name declared there that still also has a legacy `$name ??= ...;` line for itself is a real
  // compile error (CastTemplateEngine\Props::scan() rejects it, since the prelude Compiler.php emits already
  // assigns that name unconditionally, making the old line silently dead code) - caught here too, so it shows up
  // as you type instead of only at the next compile.
  for (const p of parsePropsBlock(src).props) {
    const re = new RegExp(`\\$${p.name}\\s*\\?\\?=`);
    const m = re.exec(src);
    if (m) {
      problems.push({
        start: m.index, end: m.index + m[0].length, kind: "props-legacy-conflict", severity: "error",
        message: `"$${p.name}" is declared in @props{} and also uses the legacy "$${p.name} ??= ..." convention - remove the ??= line, its default now belongs in @props{}`,
      });
    }
  }

  return problems;
}

/** A prop can also be given by a `<Slot name="x">` inside the tag. */
function isProvidedBySlot(src, ref, propName) {
  if (ref.selfClosing || ref.tagEnd === null) return false;
  const re = new RegExp(`<Slot\\s+name\\s*=\\s*["']${propName}["']`);
  const close = src.indexOf(`</${ref.name}>`, ref.tagEnd);
  return re.test(src.slice(ref.tagEnd, close < 0 ? undefined : close));
}

/** The closest of `candidates` to `word` (edit distance <= 2, or the same name in another case/kebab spelling). */
function nearest(word, candidates) {
  let best = null;
  let bestDistance = 3;
  for (const c of candidates) {
    if (camel(c).toLowerCase() === word.toLowerCase()) return c;
    const d = distance(word.toLowerCase(), c.toLowerCase());
    if (d < bestDistance) {
      best = c;
      bestDistance = d;
    }
  }
  return best;
}

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

module.exports = { contextAt, diagnose, nearest, parentOf };
