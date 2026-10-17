export interface CastSettings {
    propCase: 'camel' | 'kebab' | 'snake';
    componentsPath: string[];
    viewsPath: string;
    resourcesPath: string;
    extension: string;
    diagnostics: 'hint' | 'warning' | 'off';
}
/** Mirrors the VS Code extension's own defaults (locations()/config.get() in editor/vscode/extension.js). */
export declare const DEFAULT_SETTINGS: CastSettings;
/** Fills in a default for any key `raw` doesn't supply - the LSP's own settings may arrive partial (an older
 * client, an initializationOptions payload missing a key the extension hasn't started sending yet). */
export declare function resolveSettings(raw: Partial<CastSettings> | undefined): CastSettings;
//# sourceMappingURL=settings.d.ts.map