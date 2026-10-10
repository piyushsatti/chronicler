import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const appRoot = fileURLToPath(new URL('.', import.meta.url));
const srcRoot = path.resolve(appRoot, 'src');
const discordJsRoot = path.resolve(appRoot, 'node_modules/discord.js');

export default defineConfig({
  resolve: {
    alias: {
      '@discord': srcRoot,
      'discord.js': discordJsRoot,
    },
  },
  test: {
    include: [path.resolve(appRoot, 'tests/**/*.test.ts')],
    env: {
      DISCORD_TOKEN: 'test-token',
      BOT_CLIENT_ID: 'test-client-id',
      GUILD_ID: 'test-guild-id',
      INGEST_SECRET: 'test-ingest-secret',
    },
  },
});
