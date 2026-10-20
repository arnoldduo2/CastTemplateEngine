import { ComponentMetadata } from '../types.js';
import { CastSettings } from '../settings.js';
export declare class ProjectIndex {
    private components;
    private fileToTag;
    private workspaceRoots;
    private settings;
    private parser;
    constructor(workspaceRoots?: string[]);
    setWorkspaceRoots(roots: string[]): void;
    /** Stores the resolved cast.* settings and re-indexes, so a changed componentsPath/extension takes effect. */
    setSettings(settings: CastSettings): void;
    private componentDirs;
    /** A `<Tag>` component's candidate paths, same componentsPath settings as the in-memory index itself - used
     * only for the "tried these paths" hover on a tag that isn't (or isn't yet) indexed; getComponent() is still
     * the fast, authoritative lookup for a tag the index already has. */
    resolveComponentTag(tag: string): {
        file: string | null;
        tried: string[];
    };
    /** `Component('btns.add-new')` - resolved against the same componentsPath settings as component tags. */
    resolveLegacyComponent(name: string): {
        file: string | null;
        tried: string[];
    };
    /** `__includes('layouts.header')`, `view('home.home')` - resolved under the first workspace root's viewsPath. */
    resolveView(name: string): {
        file: string | null;
        tried: string[];
    };
    /** `__modules('items.items', 'js')` - resolved under the first workspace root's resourcesPath. */
    resolveModule(name: string, type: 'css' | 'js'): {
        file: string | null;
        tried: string[];
    };
    indexAll(): Promise<void>;
    private scanDirectory;
    private scanRecursive;
    indexFile(baseDir: string, fsPath: string, isFramework?: boolean): ComponentMetadata | null;
    removeFile(fsPath: string): void;
    getComponent(tag: string): ComponentMetadata | undefined;
    getAllComponents(): ComponentMetadata[];
    getComponentByPath(fsPath: string): ComponentMetadata | undefined;
    private resolveAllExtends;
    private resolveExtendsChain;
    private pathToTag;
}
//# sourceMappingURL=projectIndex.d.ts.map