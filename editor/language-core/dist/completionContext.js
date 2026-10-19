"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanComponents = scanComponents;
exports.parentOf = parentOf;
exports.contextAt = contextAt;
/**
 * Component-tag-adjacent completion contexts: what is being typed at an offset (a tag name, an attribute name, an
 * attribute value, or a `<Slot name="...">` name). Pure functions on a string, no VS Code/LSP API - ported from
 * editor/vscode/lib/complete.js's `contextAt` (and the `scanComponents` scan it depends on, from lib/scan.js) so
 * the language server can share the exact same "what is being typed" logic as the extension's own completions,
 * instead of a second, independently-drifted heuristic (the gap Task 8 of the Cast LSP Precedence plan closes).
 */
const propHelpers_js_1 = require("./componentSpec/propHelpers.js");
const NAME = '[A-Z][A-Za-z0-9_]*(?:\\.[A-Z][A-Za-z0-9_]*)*';
const COMPONENT_OPEN = new RegExp(`<(\\/?)(${NAME})(?=[\\s/>])`, 'y');
const RAW_ELEMENT = /<(script|style)\b/iy;
const ATTRIBUTE_NAME = /[A-Za-z_:@][-A-Za-z0-9_:.@]*/y;
/** The component tags (opening and closing), the same scan the engine's compiler reads, in document order. */
function scanComponents(src) {
    const found = [];
    let pos = 0;
    while (pos < src.length) {
        const lt = src.indexOf('<', pos);
        if (lt < 0)
            break;
        pos = lt;
        if (src.startsWith('<?', pos)) {
            const end = src.indexOf('?>', pos + 2);
            pos = end < 0 ? src.length : end + 2;
            continue;
        }
        if (src.startsWith('<!--', pos)) {
            const end = src.indexOf('-->', pos + 4);
            pos = end < 0 ? src.length : end + 3;
            continue;
        }
        RAW_ELEMENT.lastIndex = pos;
        const raw = RAW_ELEMENT.exec(src);
        if (raw) {
            const close = src.toLowerCase().indexOf(`</${raw[1].toLowerCase()}`, pos);
            if (close < 0)
                break;
            pos = close + 2;
            continue;
        }
        COMPONENT_OPEN.lastIndex = pos;
        const tag = COMPONENT_OPEN.exec(src);
        if (tag) {
            const closing = tag[1] === '/';
            const start = pos + 1 + tag[1].length;
            const ref = {
                kind: 'component', name: tag[2], start, end: start + tag[2].length, closing,
                tagStart: pos, tagEnd: null, selfClosing: false, attrs: []
            };
            found.push(ref);
            pos += tag[0].length;
            if (closing) {
                pos = skipTo(src, pos, '>');
                ref.tagEnd = src[pos - 1] === '>' ? pos : null;
            }
            else {
                pos = attributes(src, pos, found, ref);
            }
            continue;
        }
        if (/^<[A-Za-z]/.test(src.slice(pos, pos + 2))) {
            pos = attributes(src, pos + 1, found);
            continue;
        }
        pos++;
    }
    return found;
}
function skipTo(src, pos, char) {
    const i = src.indexOf(char, pos);
    return i < 0 ? src.length : i + 1;
}
function attributes(src, pos, found, ref = null) {
    while (pos < src.length) {
        const c = src[pos];
        if (c === '>') {
            if (ref) {
                ref.tagEnd = pos + 1;
                ref.selfClosing = src[pos - 1] === '/';
            }
            return pos + 1;
        }
        if (ref && /[A-Za-z_:@]/.test(c)) {
            ATTRIBUTE_NAME.lastIndex = pos;
            const m = ATTRIBUTE_NAME.exec(src);
            const attr = { name: m[0], nameStart: pos, nameEnd: pos + m[0].length, equals: null, valueType: null, valueStart: null, valueEnd: null };
            ref.attrs.push(attr);
            pos = attr.nameEnd;
            let look = pos;
            while (look < src.length && /\s/.test(src[look]))
                look++;
            if (src[look] === '=') {
                attr.equals = look;
                pos = look + 1;
                while (pos < src.length && /\s/.test(src[pos]))
                    pos++;
                const q = src[pos];
                if (q === '"' || q === "'") {
                    attr.valueType = 'string';
                    attr.valueStart = pos + 1;
                    const end = quoted(src, pos, q);
                    attr.valueEnd = src[end - 1] === q && end - 1 >= attr.valueStart ? end - 1 : null;
                    pos = end;
                }
                else if (q === '{') {
                    attr.valueType = 'brace';
                    attr.valueStart = pos + 1;
                    const end = braces(src, pos + 1, found);
                    attr.valueEnd = src[end - 1] === '}' && end - 1 >= attr.valueStart ? end - 1 : null;
                    pos = end;
                }
            }
            continue;
        }
        if (c === '"' || c === "'") {
            pos = quoted(src, pos, c);
        }
        else if (c === '{') {
            const start = pos;
            pos = braces(src, pos + 1, found);
            if (ref && /^\{\s*\.\.\./.test(src.slice(start, start + 12))) {
                ref.attrs.push({ name: null, nameStart: start, nameEnd: start, equals: null, valueType: 'spread', valueStart: start + 1, valueEnd: src[pos - 1] === '}' ? pos - 1 : null });
            }
        }
        else if (src.startsWith('<?', pos)) {
            const end = src.indexOf('?>', pos + 2);
            pos = end < 0 ? src.length : end + 2;
        }
        else {
            pos++;
        }
    }
    return pos;
}
function quoted(src, pos, quote) {
    pos++;
    while (pos < src.length) {
        if (src.startsWith('<?', pos)) {
            const end = src.indexOf('?>', pos + 2);
            pos = end < 0 ? src.length : end + 2;
            continue;
        }
        if (src[pos] === '\\') {
            pos += 2;
            continue;
        }
        if (src[pos] === quote)
            return pos + 1;
        pos++;
    }
    return pos;
}
function braces(src, pos, found) {
    let depth = 1;
    while (pos < src.length) {
        const c = src[pos];
        if (c === '"' || c === "'") {
            pos = phpString(src, pos, c);
            continue;
        }
        if (c === '{') {
            depth++;
        }
        else if (c === '}') {
            if (--depth === 0)
                return pos + 1;
        }
        else if (c === '<') {
            COMPONENT_OPEN.lastIndex = pos;
            const tag = COMPONENT_OPEN.exec(src);
            if (tag && tag[1] === '') {
                const start = pos + 1;
                const ref = {
                    kind: 'component', name: tag[2], start, end: start + tag[2].length, closing: false,
                    tagStart: pos, tagEnd: null, selfClosing: false, attrs: []
                };
                found.push(ref);
                pos = attributes(src, pos + tag[0].length, found, ref);
                continue;
            }
        }
        pos++;
    }
    return pos;
}
function phpString(src, pos, quote) {
    pos++;
    while (pos < src.length) {
        if (src[pos] === '\\') {
            pos += 2;
            continue;
        }
        if (src[pos] === quote)
            return pos + 1;
        pos++;
    }
    return pos;
}
function openTags(refs) {
    return refs.filter((r) => !r.closing);
}
/** The component that contains a `<Slot>`: the nearest enclosing opened (not self-closed) component. */
function parentOf(refs, slot) {
    const stack = [];
    for (const r of refs) {
        if (r === slot)
            return stack[stack.length - 1] || null;
        if (r.name === 'Slot')
            continue;
        if (r.closing) {
            for (let i = stack.length - 1; i >= 0; i--)
                if (stack[i].name === r.name) {
                    stack.length = i;
                    break;
                }
        }
        else if (!r.selfClosing && r.tagEnd !== null) {
            stack.push(r);
        }
    }
    return null;
}
/** A tag with no `>` yet: only treat the cursor as inside it when no other tag starts between the name and the cursor. */
function lineEndsOrNoMoreTags(src, ref, offset) {
    return !/[<>]/.test(src.slice(ref.end, offset));
}
function usedNames(ref, except) {
    const used = new Set();
    for (const a of ref.attrs)
        if (a.name && a !== except)
            used.add((0, propHelpers_js_1.camel)(a.name));
    return used;
}
/**
 * What is being typed at `offset`:
 *  {type: 'tag', prefix, start, end}                                  after `<` and the first letters of a component name
 *  {type: 'attribute', ref, prefix, start, end, used}                 a prop name inside an open component tag
 *  {type: 'value', ref, attr, prefix, start, end, quoted}             the value of a prop (inside quotes, or right after `=`)
 *  {type: 'slot', ref, parent, attr, prefix, start, end}              the name of a `<Slot name="...">`
 */
function contextAt(src, offset) {
    const before = src.slice(Math.max(0, offset - 80), offset);
    const tag = /<([A-Z][A-Za-z0-9_.]*)?$/.exec(before);
    if (tag && !/^\s*\?/.test(src.slice(offset - before.length + tag.index + 1, offset - before.length + tag.index + 2))) {
        const prefix = tag[1] || '';
        const afterName = /^[A-Za-z0-9_.]*/.exec(src.slice(offset))[0];
        const lt = offset - prefix.length - 1;
        const lastOpen = src.lastIndexOf('<?', lt);
        const lastClose = src.lastIndexOf('?>', lt);
        const comment = src.lastIndexOf('<!--', lt) > src.lastIndexOf('-->', lt);
        if (!(lastOpen > lastClose) && !comment)
            return { type: 'tag', prefix, start: offset - prefix.length, end: offset + afterName.length };
    }
    const refs = scanComponents(src);
    const ref = openTags(refs).find((r) => offset > r.end && offset > r.tagStart && (r.tagEnd === null ? lineEndsOrNoMoreTags(src, r, offset) : offset < r.tagEnd));
    if (!ref)
        return null;
    for (const attr of ref.attrs) {
        if (attr.valueType === 'string' && attr.valueStart <= offset && (attr.valueEnd === null || offset <= attr.valueEnd)) {
            const prefix = src.slice(attr.valueStart, offset);
            if (ref.name === 'Slot' && attr.name && (0, propHelpers_js_1.camel)(attr.name) === 'name') {
                const parent = parentOf(refs, ref);
                return { type: 'slot', ref, parent, attr, prefix, start: attr.valueStart, end: attr.valueEnd ?? offset };
            }
            return { type: 'value', ref, attr, prefix, start: attr.valueStart, end: attr.valueEnd ?? offset, quoted: true };
        }
        if (attr.valueType === null && attr.equals !== null && offset > attr.equals) {
            return { type: 'value', ref, attr, prefix: '', start: offset, end: offset, quoted: false };
        }
        if (attr.valueType === null && attr.nameStart <= offset && offset <= attr.nameEnd) {
            return { type: 'attribute', ref, prefix: src.slice(attr.nameStart, offset), start: attr.nameStart, end: attr.nameEnd, used: usedNames(ref, attr) };
        }
        if (attr.valueType !== null && attr.valueType !== 'spread' && attr.valueStart !== null && offset >= attr.nameStart && offset <= attr.nameEnd) {
            return { type: 'attribute', ref, prefix: src.slice(attr.nameStart, offset), start: attr.nameStart, end: attr.nameEnd, used: usedNames(ref, attr) };
        }
        if ((attr.valueType === 'brace' || attr.valueType === 'spread') && attr.valueStart <= offset && (attr.valueEnd === null || offset <= attr.valueEnd))
            return null;
    }
    return { type: 'attribute', ref, prefix: '', start: offset, end: offset, used: usedNames(ref, null) };
}
//# sourceMappingURL=completionContext.js.map