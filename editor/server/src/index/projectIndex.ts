import * as fs from 'fs';
import * as path from 'path';
import { parseComponent, resolveComponent, resolveLegacyComponent, resolveView, resolveModule, splitUnion } from 'cast-language-core';
import { ComponentMetadata, PropDefinition } from '../types.js';
import { CastSettings, DEFAULT_SETTINGS } from '../settings.js';
import { CastParser } from '../parser/castParser.js';

/** parseComponent (cast-language-core) is pure text analysis with no position tracking, matching the PHP reader's
 * own JSON-only output - but a @props{} entry's declared range (for go-to-definition on a prop) only exists in
 * CastParser's real AST. CastParser stays in use for that one piece; every other field comes from parseComponent. */
function isNullableType(type: string | null): boolean {
  if (!type) return false;
  if (type.startsWith('?')) return true;
  return splitUnion(type).some((t) => /^null$/i.test(t));
}

export class ProjectIndex {
  private components: Map<string, ComponentMetadata> = new Map(); // Tag => Metadata
  private fileToTag: Map<string, string> = new Map();             // fsPath => Tag
  private workspaceRoots: string[] = [];
  private settings: CastSettings = DEFAULT_SETTINGS;
  private parser: CastParser = new CastParser(); // @props{} entry ranges only - see isNullableType's comment above

  constructor(workspaceRoots: string[] = []) {
    this.workspaceRoots = workspaceRoots;
  }

  public setWorkspaceRoots(roots: string[]): void {
    this.workspaceRoots = roots;
  }

  /** Stores the resolved cast.* settings and re-indexes, so a changed componentsPath/extension takes effect. */
  public setSettings(settings: CastSettings): void {
    this.settings = settings;
    void this.indexAll();
  }

  private componentDirs(): string[] {
    return this.workspaceRoots.flatMap((root) => this.settings.componentsPath.map((p) => path.join(root, p)));
  }

  /** A `<Tag>` component's candidate paths, same componentsPath settings as the in-memory index itself - used
   * only for the "tried these paths" hover on a tag that isn't (or isn't yet) indexed; getComponent() is still
   * the fast, authoritative lookup for a tag the index already has. */
  public resolveComponentTag(tag: string): { file: string | null; tried: string[] } {
    return resolveComponent(tag, this.componentDirs(), this.settings.extension);
  }

  /** `Component('btns.add-new')` - resolved against the same componentsPath settings as component tags. */
  public resolveLegacyComponent(name: string): { file: string | null; tried: string[] } {
    return resolveLegacyComponent(name, this.componentDirs(), this.settings.extension);
  }

  /** `__includes('layouts.header')`, `view('home.home')` - resolved under the first workspace root's viewsPath. */
  public resolveView(name: string): { file: string | null; tried: string[] } {
    const root = this.workspaceRoots[0];
    if (!root) return { file: null, tried: [] };
    return resolveView(name, path.join(root, this.settings.viewsPath), this.settings.extension);
  }

  /** `__modules('items.items', 'js')` - resolved under the first workspace root's resourcesPath. */
  public resolveModule(name: string, type: 'css' | 'js'): { file: string | null; tried: string[] } {
    const root = this.workspaceRoots[0];
    if (!root) return { file: null, tried: [] };
    return resolveModule(name, type, path.join(root, this.settings.resourcesPath));
  }

  public async indexAll(): Promise<void> {
    this.components.clear();
    this.fileToTag.clear();

    for (const root of this.workspaceRoots) {
      await this.scanDirectory(root);
    }

    // Resolve extends chains
    this.resolveAllExtends();
  }

  private async scanDirectory(root: string): Promise<void> {
    if (!fs.existsSync(root)) return;

    // cast.componentsPath (settings.ts) first, so a project with a custom folder (or config/view.php's
    // `'components' => '...'` override, which the extension forwards as part of componentsPath - see
    // editor/vscode/extension.js's castSettings) gets its components indexed under the right tag/baseDir, not
    // only (or wrongly, via a fallback entry below with the wrong baseDir) picked up by coincidence.
    const potentialDirs = [
      ...this.settings.componentsPath.map((p) => path.join(root, p)),
      path.join(root, 'resources/views/components'),
      path.join(root, 'resources/views'),
      path.join(root, 'src/resources/views/components'),
      path.join(root, 'src/resources/views'),
      path.join(root, 'components'),
      // Framework-owned views
      path.join(root, 'starter/resources/views/components'),
      path.join(root, 'starter/resources/views'),
    ];

    for (const dir of new Set(potentialDirs)) {
      if (fs.existsSync(dir)) {
        const isFramework = dir.includes('starter') || dir.includes('vendor');
        await this.scanRecursive(dir, dir, isFramework);
      }
    }
  }

  private async scanRecursive(baseDir: string, currentDir: string, isFramework: boolean): Promise<void> {
    const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'vendor') {
          await this.scanRecursive(baseDir, fullPath, isFramework);
        }
      } else if (entry.isFile() && (entry.name.endsWith('.cast.php') || entry.name.endsWith('.php'))) {
        this.indexFile(baseDir, fullPath, isFramework);
      }
    }
  }

  public indexFile(baseDir: string, fsPath: string, isFramework: boolean = false): ComponentMetadata | null {
    try {
      const content = fs.readFileSync(fsPath, 'utf-8');
      const stats = fs.statSync(fsPath);
      const relative = path.relative(baseDir, fsPath).replace(/\\/g, '/');

      // Tag name generation from relative path:
      // e.g. "btns/btn-soft.cast.php" -> "Btns.Soft" or "Btns.BtnSoft"
      const tag = this.pathToTag(relative);

      // The shared parser already merges docblocks, legacy ??= defaults, and @props{} with the engine's own
      // priority rule (verified byte-for-byte against the PHP reader's fixtures) - no second, independently-drifted
      // merge pass needed here. CastParser is still used, but only for a @props{} entry's own source range (for
      // go-to-definition), which parseComponent's pure text analysis has no equivalent of.
      const spec = parseComponent(content);
      const doc = this.parser.parse(fsPath, content);
      const rangeByName = new Map<string, PropDefinition['range']>();
      if (doc.propsBlock) {
        for (const entry of doc.propsBlock.entries) rangeByName.set(entry.name, entry.range);
      }

      const props = new Map<string, PropDefinition>();
      for (const prop of spec.props) {
        props.set(prop.name, {
          name: prop.name,
          type: prop.type ?? '',
          isNullable: isNullableType(prop.type),
          isRequired: prop.required,
          defaultValue: prop.default ?? undefined,
          description: prop.description || undefined,
          range: rangeByName.get(prop.name),
          values: prop.values,
          kind: prop.kind,
          deprecated: prop.deprecated,
          inferred: prop.inferred
        });
      }

      // Project view overrides framework view if duplicate tag
      const existing = this.components.get(tag);
      if (existing && !existing.isFramework && isFramework) {
        return existing; // Project view takes precedence
      }

      const meta: ComponentMetadata = {
        tag,
        fsPath,
        relativePath: relative,
        isFramework,
        description: spec.description || undefined,
        extends: spec.extends,
        props,
        slots: spec.slots,
        deprecated: spec.deprecated,
        examples: spec.examples,
        mtime: stats.mtimeMs
      };

      this.components.set(tag, meta);
      this.fileToTag.set(fsPath, tag);
      return meta;
    } catch {
      return null;
    }
  }

  public removeFile(fsPath: string): void {
    const tag = this.fileToTag.get(fsPath);
    if (tag) {
      this.components.delete(tag);
      this.fileToTag.delete(fsPath);
    }
  }

  public getComponent(tag: string): ComponentMetadata | undefined {
    // Exact match
    if (this.components.has(tag)) {
      return this.components.get(tag);
    }

    // Case-insensitive or normalized match
    const lower = tag.toLowerCase();
    for (const [k, meta] of this.components.entries()) {
      if (k.toLowerCase() === lower) {
        return meta;
      }
    }

    return undefined;
  }

  public getAllComponents(): ComponentMetadata[] {
    return Array.from(this.components.values());
  }

  public getComponentByPath(fsPath: string): ComponentMetadata | undefined {
    const tag = this.fileToTag.get(fsPath);
    return tag ? this.components.get(tag) : undefined;
  }

  private resolveAllExtends(): void {
    for (const meta of this.components.values()) {
      if (meta.extends) {
        this.resolveExtendsChain(meta, new Set());
      }
    }
  }

  private resolveExtendsChain(child: ComponentMetadata, visited: Set<string>): void {
    if (!child.extends || visited.has(child.tag)) return;
    visited.add(child.tag);

    const parent = this.getComponent(child.extends);
    if (!parent) return;

    // Recurse first if parent also extends
    if (parent.extends) {
      this.resolveExtendsChain(parent, visited);
    }

    // Merge parent props that aren't overridden
    for (const [name, prop] of parent.props.entries()) {
      if (!child.props.has(name)) {
        child.props.set(name, { ...prop });
      }
    }
  }

  private pathToTag(relPath: string): string {
    // Strip extensions: .cast.php or .php
    const clean = relPath.replace(/\.(cast\.php|php)$/, '');
    const parts = clean.split(/[\\/]/);

    const titleParts = parts.map(part => {
      // Convert kebab-case or snake_case to PascalCase
      return part
        .split(/[-_]/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
    });

    return titleParts.join('.');
  }
}
