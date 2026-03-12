import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileTreeOps } from '../telemetry/metrics.js';

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  children?: FileEntry[];
}

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.cache',
  '__pycache__',
]);
const MAX_ENTRIES = 500;

export class FileTreeService {
  listDirectory(
    dirPath: string,
    opts?: { depth?: number; maxEntries?: number },
  ): FileEntry[] {
    fileTreeOps.add(1, { operation: 'listDirectory' });
    const depth = opts?.depth ?? 3;
    const maxEntries = opts?.maxEntries ?? MAX_ENTRIES;
    const results: FileEntry[] = [];
    this._walk(dirPath, dirPath, depth, maxEntries, results);
    return this._buildTree(results);
  }

  private _buildTree(flat: FileEntry[]): FileEntry[] {
    const map = new Map<string, FileEntry>();
    const roots: FileEntry[] = [];
    // Create entries with children arrays for directories
    for (const entry of flat) {
      const node: FileEntry =
        entry.type === 'directory' ? { ...entry, children: [] } : { ...entry };
      map.set(entry.path, node);
    }
    for (const node of map.values()) {
      const sep = node.path.lastIndexOf('/');
      const parentPath = sep > 0 ? node.path.substring(0, sep) : '';
      const parent = parentPath ? map.get(parentPath) : undefined;
      if (parent?.children) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  private _walk(
    base: string,
    current: string,
    depth: number,
    maxEntries: number,
    results: FileEntry[],
  ): void {
    if (depth < 0 || results.length >= maxEntries) return;
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const name of entries) {
      if (results.length >= maxEntries) break;
      const fullPath = join(current, name);
      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }
      const isDir = stat.isDirectory();
      if (isDir && SKIP_DIRS.has(name)) continue;
      results.push({
        name,
        path: relative(base, fullPath),
        type: isDir ? 'directory' : 'file',
        size: isDir ? undefined : stat.size,
        modified: stat.mtime.toISOString(),
      });
      if (isDir && depth > 0) {
        this._walk(base, fullPath, depth - 1, maxEntries, results);
      }
    }
  }

  searchFiles(dirPath: string, query: string, maxResults = 50): FileEntry[] {
    fileTreeOps.add(1, { operation: 'searchFiles' });
    const lower = query.toLowerCase();
    const all = this.listDirectory(dirPath, {
      depth: 10,
      maxEntries: MAX_ENTRIES,
    });
    return all
      .filter((e) => e.name.toLowerCase().includes(lower))
      .slice(0, maxResults);
  }

  readFile(filePath: string): string {
    fileTreeOps.add(1, { operation: 'readFile' });
    if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    const buf = readFileSync(filePath);
    // Heuristic binary check: look for null bytes in first 8KB
    const sample = buf.slice(0, 8192);
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0)
        throw new Error(`File appears to be binary: ${filePath}`);
    }
    return buf.toString('utf-8');
  }
}
