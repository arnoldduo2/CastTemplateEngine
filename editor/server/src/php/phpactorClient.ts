import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { StreamMessageReader, StreamMessageWriter, createMessageConnection, MessageConnection } from 'vscode-jsonrpc/node.js';
import { VirtualPhpDocument } from 'cast-language-core';
import { PhpDiagnosticClient, UpstreamDiagnostic } from './phpRouter.js';

export interface PhpactorCommand {
  command: string;
  args: string[];
}

/** A persistent LSP client for Phpactor; Cast files are synchronized as virtual PHP documents. */
export class PhpactorClient implements PhpDiagnosticClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private connection: MessageConnection | null = null;
  private readonly openedVersions = new Map<string, number>();
  private readonly diagnostics = new Map<string, UpstreamDiagnostic[]>();

  public constructor(private readonly command: PhpactorCommand) {}

  public async start(workspaceFolders: string[]): Promise<void> {
    if (this.connection) return;
    this.process = spawn(this.command.command, this.command.args, { stdio: 'pipe', windowsHide: true });
    this.process.once('error', () => this.dispose());
    this.process.once('exit', () => this.dispose());
    const connection = createMessageConnection(new StreamMessageReader(this.process.stdout), new StreamMessageWriter(this.process.stdin));
    connection.onNotification('textDocument/publishDiagnostics', (params: { uri: string; diagnostics: UpstreamDiagnostic[] }) => {
      this.diagnostics.set(params.uri, params.diagnostics ?? []);
    });
    connection.listen();
    this.connection = connection;
    await connection.sendRequest('initialize', {
      processId: process.pid,
      rootUri: workspaceFolders[0] ? `file://${workspaceFolders[0].replace(/\\/g, '/')}` : null,
      workspaceFolders: workspaceFolders.map((folder) => ({ uri: `file://${folder.replace(/\\/g, '/')}`, name: folder.split(/[\\/]/).pop() ?? folder })),
      capabilities: { textDocument: { publishDiagnostics: { relatedInformation: true } } },
    });
    await connection.sendNotification('initialized', {});
  }

  public async synchronize(virtual: VirtualPhpDocument, version: number = 1): Promise<UpstreamDiagnostic[]> {
    const connection = this.connection;
    if (!connection) return [];
    const priorVersion = this.openedVersions.get(virtual.uri);
    if (priorVersion === undefined) {
      await connection.sendNotification('textDocument/didOpen', { textDocument: { uri: virtual.uri, languageId: 'php', version, text: virtual.text } });
    } else if (priorVersion !== version) {
      await connection.sendNotification('textDocument/didChange', { textDocument: { uri: virtual.uri, version }, contentChanges: [{ text: virtual.text }] });
    }
    this.openedVersions.set(virtual.uri, version);
    return this.diagnostics.get(virtual.uri) ?? [];
  }

  public async request<T>(method: string, params: unknown): Promise<T | null> {
    if (!this.connection) return null;
    try {
      return await this.connection.sendRequest<T>(method, params);
    } catch {
      return null;
    }
  }

  public async stop(): Promise<void> {
    if (!this.connection) return;
    try {
      await this.connection.sendRequest('shutdown');
      await this.connection.sendNotification('exit');
    } finally {
      this.dispose();
    }
  }

  private dispose(): void {
    this.connection?.dispose();
    this.connection = null;
    this.process?.kill();
    this.process = null;
    this.openedVersions.clear();
  }
}
