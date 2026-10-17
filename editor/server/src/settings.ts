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
 * client, an initializationOptions payload missing a key the extension hasn't started sending yet). */
export function resolveSettings(raw: Partial<CastSettings> | undefined): CastSettings {
  return { ...DEFAULT_SETTINGS, ...raw };
}
