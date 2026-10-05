// Kept for convenience: same as `npm run build -- crazygames <server>`.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const build = fileURLToPath(new URL('./build.mjs', import.meta.url));
const r = spawnSync(process.execPath, [build, 'crazygames', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
