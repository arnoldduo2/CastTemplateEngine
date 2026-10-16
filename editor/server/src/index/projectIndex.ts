import * as fs from 'fs';
import * as path from 'path';
import { ComponentMetadata, PropDefinition } from '../types.js';
import { CastParser } from '../parser/castParser.js';

export class ProjectIndex {
  private components: Map<string, ComponentMetadata> = new Map(); // Tag => Metadata
  private fileToTag: Map<string, string> = new Map();             // fsPath => Tag
  private parser: CastParser = new CastParser();
  private workspaceRoots: string[] = [];

  constructor(workspaceRoots: string[] = []) {
    this.workspaceRoots = workspaceRoots;
  }

  public setWorkspaceRoots(roots: string[]): void {
    this.workspaceRoots = roots;
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

    // Scan standard component folders
    const potentialDirs = [
      path.join(root, 'resources/views/components'),
      path.join(root, 'resources/views'),
      path.join(root, 'src/resources/views/components'),
      path.join(root, 'src/resources/views'),
      path.join(root, 'components'),
      // Framework-owned views
      path.join(root, 'starter/resources/views/components'),
      path.join(root, 'starter/resources/views'),
    ];

    for (const dir of potentialDirs) {
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
      const doc = this.parser.parse(fsPath, content);

      const props = new Map<string, PropDefinition>();
      let description: string | undefined;

      // Extract props from @props block
      if (doc.propsBlock) {
        for (const entry of doc.propsBlock.entries) {
          props.set(entry.name, {
            name: entry.name,
            type: entry.type,
            isNullable: entry.isNullable,
            isRequired: entry.isRequired,
            defaultValue: entry.defaultValue,
            range: entry.range
          });
        }
      }

      // Also extract docblock props / descriptions if present
      const docblockMatch = /\/\*\*([\s\S]*?)\*\//.exec(content);
      if (docblockMatch) {
        const docText = docblockMatch[1];
        const descMatch = /^\s*\*\s*([^@\n\r][^\n\r]*)/m.exec(docText);
        if (descMatch) {
          description = descMatch[1].trim();
        }

        const paramRegex = /@param\s+(\S+)\s+\$([a-zA-Z0-9_]+)(?:\s+(.*))?/g;
        let pMatch: RegExpExecArray | null;
        while ((pMatch = paramRegex.exec(docText)) !== null) {
          const type = pMatch[1];
          const name = pMatch[2];
          const desc = pMatch[3]?.trim();

          if (!props.has(name)) {
            props.set(name, {
              name,
              type,
              isNullable: type.includes('null') || type.startsWith('?'),
              isRequired: false,
              description: desc
            });
          } else {
            const existing = props.get(name)!;
            if (desc) existing.description = desc;
          }
        }
      }

      const slots: string[] = [];
      for (const comp of doc.components) {
        if (comp.name === 'Slot') {
          const nameAttr = comp.attributes.find(a => a.name === 'name');
          if (nameAttr?.value) {
            slots.push(nameAttr.value);
          }
        }
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
        description,
        extends: doc.propsBlock?.extendsTarget,
        props,
        slots,
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
