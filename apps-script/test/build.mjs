// Biên dịch các module logic thuần rồi nạp vào test.
//
// Vì sao cần bước rewrite: `tsc` hiểu alias `@/` để CHECK type, nhưng khi emit
// nó giữ nguyên chuỗi `require("@/lib/sheets/campGeo")` — Node không biết alias
// đó là gì và ném MODULE_NOT_FOUND. Next.js không gặp lỗi này vì webpack tự
// phân giải alias khi bundle, nên module chạy tốt trên dashboard mà vẫn không
// nạp được trong test. Ở đây alias được đổi thành đường dẫn tương đối trong
// chính .build, nên module nào bị import gián tiếp cũng phải nằm trong
// `include` của tsconfig.build.json.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const OUT = join(ROOT, 'apps-script/test/.build');

const jsFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? jsFiles(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : [],
  );

/** Chạy tsc, đổi alias thành đường dẫn tương đối, trả về hàm nạp module. */
export function buildAndLoad() {
  execFileSync('npx', ['tsc', '-p', 'apps-script/test/tsconfig.build.json'],
    { stdio: 'pipe', shell: true });

  for (const file of jsFiles(OUT)) {
    const src = readFileSync(file, 'utf8');
    // '@/lib/sheets/campGeo' -> đường dẫn tương đối tới .build/sheets/campGeo
    const next = src.replace(/(["'])@\/lib\/([^"']+)\1/g, (_m, q, rest) => {
      const target = join(OUT, rest.split('/').join(sep));
      let rel = relative(dirname(file), target).split(sep).join('/');
      if (!rel.startsWith('.')) rel = `./${rel}`;
      return `${q}${rel}${q}`;
    });
    if (next !== src) writeFileSync(file, next);
  }

  return (rel) => import(pathToFileURL(join(OUT, rel)).href);
}
