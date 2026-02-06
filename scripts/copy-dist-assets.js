import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = [
  {
    from: resolve(root, 'src/lib/query-ids.json'),
    to: resolve(root, 'dist/lib/query-ids.json'),
  },
  {
    from: resolve(root, 'src/lib/features.json'),
    to: resolve(root, 'dist/lib/features.json'),
  },
];

const directories = [
  {
    from: resolve(root, 'src/web/public'),
    to: resolve(root, 'dist/web/public'),
  },
];

function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from)) {
    const sourcePath = resolve(from, entry);
    const targetPath = resolve(to, entry);
    const stats = statSync(sourcePath);
    if (stats.isDirectory()) {
      copyDir(sourcePath, targetPath);
    } else if (stats.isFile()) {
      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, readFileSync(sourcePath));
    }
  }
}

for (const file of files) {
  mkdirSync(dirname(file.to), { recursive: true });
  writeFileSync(file.to, readFileSync(file.from));
}

for (const dir of directories) {
  copyDir(dir.from, dir.to);
}
