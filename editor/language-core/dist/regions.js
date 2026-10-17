"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeCast = analyzeCast;
exports.firstMarkupOffset = firstMarkupOffset;
const BLOCK_STARTS = new Set(['if', 'unless', 'isset', 'for', 'foreach', 'forelse', 'while', 'switch', 'php']);
const BLOCK_ENDS = new Set(['endif', 'endunless', 'endisset', 'endfor', 'endforeach', 'endforelse', 'endwhile', 'endswitch', 'endphp']);
const INTERMEDIATES = new Set(['elseif', 'else', 'empty', 'case', 'default']);
const PHP_ARGUMENT_DIRECTIVES = new Set([
    'if', 'unless', 'isset', 'for', 'foreach', 'forelse', 'while', 'switch', 'case', 'elseif', 'php',
    'break', 'continue', 'map', 'filter',
]);
function range(text, start, end) {
    return { start, end, text: text.slice(start, end) };
}
/** Finds a closing delimiter while preserving PHP, CSS, and JS string/comment boundaries. */
function balanced(text, open, closeChar) {
    let depth = 1;
    for (let cursor = open + 1; cursor < text.length; cursor += 1) {
        const char = text[cursor];
        const next = text[cursor + 1];
        if (char === '"' || char === "'" || char === '`') {
            const quote = char;
            cursor += 1;
            while (cursor < text.length) {
                if (text[cursor] === '\\')
                    cursor += 2;
                else if (text[cursor++] === quote)
                    break;
            }
            cursor -= 1;
            continue;
        }
        if (char === '/' && next === '/') {
            const newline = text.indexOf('\n', cursor + 2);
            cursor = newline === -1 ? text.length : newline;
            continue;
        }
        if (char === '/' && next === '*') {
            const commentEnd = text.indexOf('*/', cursor + 2);
            cursor = commentEnd === -1 ? text.length : commentEnd + 1;
            continue;
        }
        if (char === text[open])
            depth += 1;
        else if (char === closeChar && --depth === 0) {
            return { contentStart: open + 1, contentEnd: cursor, close: cursor };
        }
    }
    return null;
}
function directiveType(name, hasArgs) {
    const isBlockStart = BLOCK_STARTS.has(name) && !(name === 'php' && hasArgs);
    const isBlockEnd = BLOCK_ENDS.has(name);
    const isIntermediate = INTERMEDIATES.has(name);
    let blockType;
    if (isBlockStart)
        blockType = name;
    else if (isBlockEnd)
        blockType = name.slice(3);
    else if (name === 'elseif' || name === 'else')
        blockType = 'if';
    else if (name === 'empty')
        blockType = 'forelse';
    else if (name === 'case' || name === 'default')
        blockType = 'switch';
    return { isBlockStart, isBlockEnd, isIntermediate, blockType };
}
function addRegion(analysis, kind, start, end, owner) {
    if (end > start)
        analysis.regions.push({ kind, range: range(analysis.text, start, end), owner });
}
function addPhpRegion(analysis, start, end, owner) {
    while (start < end && /\s/.test(analysis.text[start]))
        start += 1;
    while (end > start && (analysis.text[end - 1] === '\n' || analysis.text[end - 1] === '\r'))
        end -= 1;
    addRegion(analysis, 'php', start, end, owner);
}
function scanEchoHole(analysis, start, limit, owner) {
    const parsed = balanced(analysis.text, start + 1, '}');
    if (!parsed || parsed.close >= limit)
        return start + 2;
    addPhpRegion(analysis, parsed.contentStart, parsed.contentEnd, owner);
    return parsed.close + 1;
}
function scanEmbeddedHoles(analysis, start, end, owner) {
    for (let cursor = start; cursor < end;) {
        const hole = analysis.text.indexOf('@{', cursor);
        if (hole === -1 || hole >= end)
            return;
        cursor = scanEchoHole(analysis, hole, end, owner);
    }
}
function scan(text, analysis, start, end) {
    for (let cursor = start; cursor < end;) {
        if (text.startsWith('<?', cursor)) {
            const tagEnd = text.indexOf('?>', cursor + 2);
            if (tagEnd === -1 || tagEnd >= end)
                return;
            const prefixLength = text.startsWith('<?php', cursor) ? 5 : text.startsWith('<?=', cursor) ? 3 : 2;
            addPhpRegion(analysis, cursor + prefixLength, tagEnd);
            cursor = tagEnd + 2;
            continue;
        }
        if (text.startsWith('@{', cursor)) {
            cursor = scanEchoHole(analysis, cursor, end);
            continue;
        }
        if (text[cursor] !== '@' || text[cursor + 1] === '@') {
            cursor += 1;
            continue;
        }
        const matched = /^@([A-Za-z_][A-Za-z0-9_]*)\b/.exec(text.slice(cursor));
        if (!matched) {
            cursor += 1;
            continue;
        }
        const name = matched[1];
        const nameEnd = cursor + matched[0].length;
        let argumentStart = nameEnd;
        while (argumentStart < end && (text[argumentStart] === ' ' || text[argumentStart] === '\t'))
            argumentStart += 1;
        const hasArgs = text[argumentStart] === '(';
        const parsed = hasArgs ? balanced(text, argumentStart, ')') : null;
        const directiveEnd = parsed ? parsed.close + 1 : nameEnd;
        const node = {
            name,
            nameRange: range(text, cursor, nameEnd),
            range: range(text, cursor, directiveEnd),
            argsRange: parsed ? range(text, parsed.contentStart, parsed.contentEnd) : undefined,
            ...directiveType(name, hasArgs),
        };
        analysis.directives.push(node);
        if (name === 'php' && !hasArgs) {
            const endMatch = /@endphp\b/g;
            endMatch.lastIndex = nameEnd;
            const closing = endMatch.exec(text);
            if (!closing || closing.index >= end) {
                analysis.diagnostics.push({ range: node.nameRange, message: '@php is never closed (missing @endphp)', severity: 'error', source: 'cast-engine' });
                return;
            }
            addPhpRegion(analysis, nameEnd, closing.index, node);
            const closeStart = closing.index;
            const closeEnd = closeStart + '@endphp'.length;
            analysis.directives.push({
                name: 'endphp',
                nameRange: range(text, closeStart, closeEnd),
                range: range(text, closeStart, closeEnd),
                ...directiveType('endphp', false),
            });
            cursor = closeEnd;
            continue;
        }
        if (parsed && (name === 'css' || name === 'js' || name === 'script')) {
            addRegion(analysis, name === 'css' ? 'css' : 'javascript', parsed.contentStart, parsed.contentEnd, node);
            scanEmbeddedHoles(analysis, parsed.contentStart, parsed.contentEnd, node);
        }
        else if (parsed && PHP_ARGUMENT_DIRECTIVES.has(name)) {
            addPhpRegion(analysis, parsed.contentStart, parsed.contentEnd, node);
        }
        cursor = Math.max(directiveEnd, cursor + 1);
    }
}
/**
 * Classifies native PHP, Cast PHP holes/arguments, and CSS/JS directive bodies.
 * It deliberately does not parse an entire .cast.php document as PHP: only the
 * returned PHP regions are candidates for PHP language tooling.
 */
function analyzeCast(text) {
    const analysis = { text, directives: [], regions: [], diagnostics: [] };
    scan(text, analysis, 0, text.length);
    return analysis;
}
/**
 * Finds real markup in the same conservative way as the engine's Props scanner.
 * PHP tags and quoted strings are skipped so documentation such as `<Card />`
 * inside a PHP docblock cannot make a later @props declaration invalid.
 */
function firstMarkupOffset(text) {
    for (let cursor = 0; cursor < text.length; cursor += 1) {
        const char = text[cursor];
        if (char === '"' || char === "'") {
            const quote = char;
            cursor += 1;
            while (cursor < text.length && text[cursor] !== quote) {
                if (text[cursor] === '\\')
                    cursor += 1;
                cursor += 1;
            }
            continue;
        }
        if (char === '<' && text[cursor + 1] === '?') {
            const tagEnd = text.indexOf('?>', cursor + 2);
            cursor = tagEnd === -1 ? text.length : tagEnd + 1;
            continue;
        }
        if (char === '<' && /[A-Za-z!\/]/.test(text[cursor + 1] ?? ''))
            return cursor;
    }
    return null;
}
//# sourceMappingURL=regions.js.map