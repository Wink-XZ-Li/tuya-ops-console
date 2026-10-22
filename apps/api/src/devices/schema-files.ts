import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Walk up from the compiled or source file to the repo-root JSON exports. */
export function readRepoJson<T>(filename: string): T {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, filename);
    if (existsSync(candidate)) {
      return JSON.parse(readFileSync(candidate, 'utf8')) as T;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Cannot find ${filename} from ${__dirname}`);
}
