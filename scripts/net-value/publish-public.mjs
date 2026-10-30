// Chép các script pipeline (chỉ dùng node built-in, không chứa bí mật) sang
// public/pipeline/ để cloud routine tải về bằng curl thay vì phải clone repo
// qua GitHub. Chạy tự động ở "prebuild" (package.json) nên mỗi lần deploy là
// bản mới nhất. Token KHÔNG nằm trong các file này (đọc từ env khi chạy).
import { readdirSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', '..', 'public', 'pipeline');
mkdirSync(out, { recursive: true });

const files = readdirSync(here).filter(
  (f) => f.endsWith('.mjs') && f !== 'publish-public.mjs',
);
for (const f of files) copyFileSync(join(here, f), join(out, f));
writeFileSync(
  join(out, 'manifest.json'),
  JSON.stringify({ files, generatedAt: new Date().toISOString() }, null, 2),
);
console.log(`public/pipeline: ${files.length} files`);
