/**
 * Maps names used in views to files, with exactly the engine's rules (CastTemplateEngine\Compiler::resolve):
 *   <KpiCard>         => kpi-card, kpi_card, KpiCard, kpiCard  (+ the extension), first existing file wins
 *   <Form.TextInput>  => form/text-input ..., every segment tried in those four styles, dots are folders
 * Pure functions aside from the injectable `fs`, so both the LSP's and the extension's Node process can use them
 * unchanged, once each supplies the resolved componentDirs/viewsDir/resourcesDir (see CastSettings).
 */
import * as nodeFs from 'node:fs';
import * as path from 'node:path';

export interface FsLike {
  isFile(path: string): boolean;
  isDir(path: string): boolean;
}

export const realFs: FsLike = {
  isFile: (p: string) => {
    try {
      return nodeFs.statSync(p).isFile();
    } catch {
      return false;
    }
  },
  isDir: (p: string) => {
    try {
      return nodeFs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  },
};

export interface ResolveResult {
  file: string | null;
  tried: string[];
}

/** The four spellings of one name segment, in the engine's order. */
export function variants(name: string): string[] {
  const words = name.replace(/(?<=[a-z0-9])(?=[A-Z])/g, ' ').toLowerCase();
  const unique = [words.replace(/ /g, '-'), words.replace(/ /g, '_'), name, name.charAt(0).toLowerCase() + name.slice(1)];
  return [...new Set(unique)];
}

export function resolveComponent(tag: string, componentDirs: string[], ext = '.cast.php', fs: FsLike = realFs): ResolveResult {
  const tried: string[] = [];
  for (const root of componentDirs) {
    const segments = tag.split('.');
    let dir = root;
    for (let i = 0; i < segments.length; i++) {
      const last = i === segments.length - 1;
      let found: string | null = null;
      for (const variant of variants(segments[i])) {
        const candidate = path.join(dir, variant + (last ? ext : ''));
        tried.push(candidate);
        if (last ? fs.isFile(candidate) : fs.isDir(candidate)) {
          found = last ? candidate : variant;
          break;
        }
      }
      if (found === null) break; // not in this folder: try the next one
      if (last) return { file: found, tried };
      dir = path.join(dir, found);
    }
  }
  return { file: null, tried };
}

/** `Component('btns.add-new')`: dots are folders, the name is used as written, `.cast.php` first and then the plain `.php`. */
export function resolveLegacyComponent(name: string, componentDirs: string[], ext = '.cast.php', fs: FsLike = realFs): ResolveResult {
  return firstFile(componentDirs.flatMap((dir) => [ext, '.php'].map((e) => path.join(dir, ...name.split(/[./]/)) + e)), fs);
}

/** `__includes('layouts.header')`, `views('home.home')`: dots (or slashes) are folders under the views folder. */
export function resolveView(name: string, viewsDir: string, ext = '.cast.php', fs: FsLike = realFs): ResolveResult {
  const base = path.join(viewsDir, ...name.split(/[./]/));
  return firstFile([base + ext, base + '.php'], fs);
}

/** `__modules('items.items', 'js')` => resources/js/items/items.module.js ; css => resources/css/items/items.css */
export function resolveModule(name: string, type: 'css' | 'js', resourcesDir: string, fs: FsLike = realFs): ResolveResult {
  const base = path.join(resourcesDir, type === 'css' ? 'css' : 'js', ...name.split(/[./]/));
  return firstFile([type === 'css' ? base + '.css' : base + '.module.js'], fs);
}

function firstFile(candidates: string[], fs: FsLike): ResolveResult {
  const file = candidates.find((c) => fs.isFile(c)) || null;
  return { file, tried: candidates };
}

/** The offset of a prop's own declaration in a component file's text - a docblock `@var`/`@param`/`@prop`/
 * `@property` tag naming it, or its legacy `$name ??= default` line - whichever comes first. `null` when neither
 * is present (e.g. the prop only exists via `@props{}`, which the caller tracks a real range for separately -
 * see editor/server/src/index/projectIndex.ts's own comment on why CastParser stays in use for that one piece).
 * Ported from editor/vscode/extension.js's PropDefinitions (Ctrl+click on a prop name), so definition.ts can share
 * the exact same "where is this declared" lookup for docblock/`??=` props instead of only ever finding one for a
 * `@props{}` entry's own tracked range. */
export function propDeclarationOffset(source: string, name: string): number | null {
  const clean = name.replace(/[$]/g, '');
  const re = new RegExp(`@(?:var|param|prop|property)[^\\n]*\\$${clean}\\b|\\$${clean}\\s*\\?\\?=`);
  const m = re.exec(source);
  return m ? m.index : null;
}

/** Prop names a component file reads: `$title ??= ...`, `@var ... $title`, `@param ... $title` (best effort, for the hover). */
export function propsOf(source: string): string[] {
  const names = new Set<string>();
  const skip = new Set(['this', 'data', 'children', 'slots', 'GLOBALS']);
  for (const re of [/\$([A-Za-z_][A-Za-z0-9_]*)\s*\?\?=/g, /@(?:var|param|prop)\s+[^$\n]*\$([A-Za-z_][A-Za-z0-9_]*)/g]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) if (!skip.has(m[1])) names.add(m[1]);
  }
  return [...names];
}
