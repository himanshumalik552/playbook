import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Applies pending migrations with `prisma migrate deploy`. Runs from pruned production images,
 * where neither pnpm nor the workspace scripts are available. DATABASE_URL must be set.
 */
const cli = require.resolve('prisma/build/index.js');
const schema = join(__dirname, '..', 'prisma', 'schema.prisma');
const result = spawnSync(process.execPath, [cli, 'migrate', 'deploy', '--schema', schema], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
