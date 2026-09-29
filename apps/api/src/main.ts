import type { AppEnv } from '@adpulse/config';
import type { Logger } from '@adpulse/core';
import { createApp } from './bootstrap';
import { APP_ENV, LOGGER } from './infra/tokens';

async function main(): Promise<void> {
  const app = await createApp();
  const env = app.get<AppEnv>(APP_ENV);
  const logger = app.get<Logger>(LOGGER);
  await app.listen(env.API_PORT, '0.0.0.0');
  logger.info(
    { port: env.API_PORT, mode: env.INTEGRATION_MODE, swagger: env.SWAGGER_ENABLED },
    'ADPULSE API listening',
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `API failed to start: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
