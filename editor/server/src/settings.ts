export interface CastSettings {
  propCase: 'camel' | 'kebab' | 'snake';
  componentsPath: string[];
  viewsPath: string;
  resourcesPath: string;
  extension: string;
  diagnostics: 'hint' | 'warning' | 'off';
}

/** Mirrors the VS Code extension's own defaults (locations()/config.get() in editor/vscode/extension.js). */
export const DEFAULT_SETTINGS: CastSettings = {
  propCase: 'camel',
  componentsPath: ['resources/views/components'],
  viewsPath: 'resources/views',
  resourcesPath: 'resources',
  extension: '.cast.php',
  diagnostics: 'hint',
};

/** Fills in a default for any key `raw` doesn't supply - the LSP's own settings may arrive partial (an older
 * client, an initializationOptions payload missing a key the extension hasn't started sending yet) - and
 * normalizes shapes a raw VS Code configuration pull can hand back that `...raw` alone would let through
 * unchanged: `cast.componentsPath` is declared `["string", "array"]` in package.json with a string default, so
 * `workspace/configuration` can legitimately return a bare string there, which every `componentsPath.map(...)`
 * call downstream would otherwise throw on; an unrecognized propCase/diagnostics value (a typo, or a future
 * client ahead of this server) falls back to its own default rather than silently mis-casing every attribute or
 * dropping every diagnostic. */
export function resolveSettings(raw: Partial<CastSettings> | undefined): CastSettings {
  const merged = { ...DEFAULT_SETTINGS, ...raw };
  return {
    ...merged,
    componentsPath: ([] as string[]).concat(raw?.componentsPath ?? DEFAULT_SETTINGS.componentsPath),
    propCase: PROP_CASES.includes(merged.propCase) ? merged.propCase : DEFAULT_SETTINGS.propCase,
    diagnostics: DIAGNOSTICS_LEVELS.includes(merged.diagnostics) ? merged.diagnostics : DEFAULT_SETTINGS.diagnostics,
  };
}

const PROP_CASES: CastSettings['propCase'][] = ['camel', 'kebab', 'snake'];
const DIAGNOSTICS_LEVELS: CastSettings['diagnostics'][] = ['hint', 'warning', 'off'];
