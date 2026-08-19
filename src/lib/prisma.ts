import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

export type ExtendedPrismaClient = PrismaClient & {
  consultant: any;
};

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
  pool: Pool | undefined;
};

function createPrismaClient(): ExtendedPrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return new PrismaClient() as ExtendedPrismaClient;
  }

  if (url.includes('neon.tech')) {
    const adapter = new PrismaNeon({ connectionString: url });
    return new PrismaClient({ adapter }) as ExtendedPrismaClient;
  }

  const pool = globalForPrisma.pool ?? new Pool({
    connectionString: url,
    ssl: url.includes('localhost') || url.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (err) => {
    console.warn('PG pool background client warning:', err?.message || err);
  });

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.pool = pool;
  }

  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter }) as ExtendedPrismaClient;
}

export const prisma: ExtendedPrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
