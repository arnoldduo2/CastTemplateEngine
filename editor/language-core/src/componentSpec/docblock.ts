import { PropSpec, finish, newProp, readType, kindOf } from './propHelpers.js';
import { parsePropsBlock } from './propsBlock.js';

export interface SlotSpec {
  name: string;
  description: string;
}

export interface ComponentSpec {
  description: string;
  props: PropSpec[];
  slots: SlotSpec[];
  examples: string[];
  deprecated: boolean | string;
  extends?: string;
}

const PROP_TAGS = new Set(['var', 'param', 'prop', 'property', 'property-read', 'property-write']);

export function parseComponent(source: string): ComponentSpec {
  source = String(source).replace(/\r\n?/g, '\n');
  const blocks = docblocks(source);

  const spec: ComponentSpec = { description: '', props: [], slots: [], examples: [], deprecated: false };
  const byName = new Map<string, PropSpec>();

  for (const block of blocks) {
    if (!spec.description && block.summary) spec.description = block.summary;

    for (const tag of block.tags) {
      if (PROP_TAGS.has(tag.name)) {
        const prop = propFromTag(tag, source, block.end);
        if (prop && !byName.has(prop.name)) {
          byName.set(prop.name, prop);
          spec.props.push(prop);
        }
      } else if (tag.name === 'slot') {
        const m = /^(\S+)\s*([\s\S]*)$/.exec(tag.text);
        if (m && !spec.slots.some((s) => s.name === m[1])) spec.slots.push({ name: m[1], description: m[2].trim() });
      } else if (tag.name === 'example') {
        if (tag.raw.trim()) spec.examples.push(tag.raw.trim());
      } else if (tag.name === 'deprecated') {
        spec.deprecated = tag.text.trim() || true;
      }
    }
  }

  // defaults from the code: `$label ??= 'Button';`
  for (const { name, expression } of defaults(source)) {
    let prop = byName.get(name);
    if (!prop) {
      prop = newProp(name);
      prop.inferred = true;
      prop.kind = kindOf(null, expression);
      byName.set(name, prop);
      spec.props.push(prop);
    }
    prop.default = expression;
    prop.required = false;
  }

  for (const prop of spec.props) finish(prop);

  // @props{}'s type/required/default/kind win over a docblock's for the same name, but the docblock's own
  // description text is kept if @props{} didn't produce one - this lets a description stay hand-written prose
  // even once @props{} is the enforced source of type/required/default for that same prop.
  const propsBlock = parsePropsBlock(source);
  for (const prop of propsBlock.props) {
    const existing = byName.get(prop.name);
    if (existing && !prop.description) prop.description = existing.description;
    byName.set(prop.name, prop);
    const i = spec.props.findIndex((p) => p.name === prop.name);
    if (i === -1) spec.props.push(prop);
    else spec.props[i] = prop;
  }
  // `@props extends::Dotted.Path{}` - resolving the path to a file and merging its own props is left to the
  // caller (environment-bound: needs componentDirs/fs access this module intentionally has none of).
  if (propsBlock.extends) spec.extends = propsBlock.extends;

  return spec;
}

interface DocblockTag {
  name: string;
  text: string;
  raw: string;
}

interface DocblockEntry {
  summary: string;
  tags: DocblockTag[];
  end: number;
}

function propFromTag(tag: DocblockTag, source: string, blockEnd: number): PropSpec | null {
  let text = tag.text.trim();
  let type: string | null = null;

  if (!text.startsWith('$')) {
    const read = readType(text);
    type = read.type;
    text = read.rest.trim();
  }
  let name: string;
  const named = /^\$([A-Za-z_][A-Za-z0-9_]*)\s*([\s\S]*)$/.exec(text);
  if (named) {
    name = named[1];
    text = named[2];
  } else {
    // an inline `/** @var string The label */` belongs to the variable assigned right after it
    const next = /^\s*\$([A-Za-z_][A-Za-z0-9_]*)\s*(?:\?\?=|=)/.exec(source.slice(blockEnd));
    if (!next) return null;
    name = next[1];
  }
  const prop = newProp(name);
  prop.type = type;
  prop.description = text.replace(/^[-–—]\s*/, '').trim();
  prop.required = true; // until the type or a default says otherwise (see finish)
  prop.documented = true;
  return prop;
}

/** Every `/** ... *​/` block with its cleaned-up summary and tags. */
function docblocks(source: string): DocblockEntry[] {
  const out: DocblockEntry[] = [];
  const re = /\/\*\*([\s\S]*?)\*\//g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const lines = m[1].split('\n').map((l) => l.replace(/^\s*\*? ?/, '').replace(/\s+$/, ''));
    const summary: string[] = [];
    const tags: DocblockTag[] = [];
    let current: DocblockTag | null = null;
    for (const line of lines) {
      const t = /^@([A-Za-z][A-Za-z0-9_-]*)\s?(.*)$/.exec(line);
      if (t) {
        current = { name: t[1].toLowerCase(), text: t[2], raw: t[2] };
        tags.push(current);
      } else if (current) {
        current.raw += '\n' + line;
        if (line.trim()) current.text += (current.text ? ' ' : '') + line.trim();
      } else {
        summary.push(line);
      }
    }
    out.push({ summary: summary.join('\n').trim().replace(/\n{2,}/g, '\n\n'), tags, end: m.index + m[0].length });
  }
  return out;
}

/** `$name ??= expression;` assignments, with the expression read up to its `;` (strings and brackets aware). */
function defaults(source: string): { name: string; expression: string }[] {
  const found: { name: string; expression: string }[] = [];
  const re = /\$([A-Za-z_][A-Za-z0-9_]*)\s*\?\?=\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const start = re.lastIndex;
    const end = expressionEnd(source, start);
    found.push({ name: m[1], expression: source.slice(start, end).trim().replace(/\s+/g, ' ') });
    re.lastIndex = end;
  }
  return found;
}

function expressionEnd(src: string, i: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === "'" || c === '"') {
      quote = c;
    } else if ('([{'.includes(c)) {
      depth++;
    } else if (')]}'.includes(c)) {
      depth--;
    } else if (c === ';' && depth <= 0) {
      return i;
    } else if (c === '?' && src[i + 1] === '>' && depth <= 0) {
      return i;
    }
  }
  return i;
}
