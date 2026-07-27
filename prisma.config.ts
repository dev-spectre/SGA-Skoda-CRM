import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL || 'postgresql://username:password@ep-sample-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require',
  },
  migrations: {
    path: 'prisma/migrations',
  },
});
