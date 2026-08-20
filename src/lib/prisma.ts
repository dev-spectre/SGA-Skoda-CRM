import dns from 'dns';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Force IPv4-first DNS resolution in Node.js to prevent DNS hangs / EAI_AGAIN errors with Supabase pooler
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

export type ExtendedPrismaClient = PrismaClient & {
  consultant: any;
};

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
  pool: Pool | undefined;
};

function createPrismaClient(): ExtendedPrismaClient {
  let url = process.env.DATABASE_URL;
  if (!url) {
    return new PrismaClient() as ExtendedPrismaClient;
  }

  if (url.includes('neon.tech')) {
    const adapter = new PrismaNeon({ connectionString: url });
    return new PrismaClient({ adapter }) as ExtendedPrismaClient;
  }

  // If using Supabase pooler with session port 5432, switch to transaction pooler port 6543
  // to avoid (EMAXCONNSESSION) max 15 clients limit and connection timeouts under load
  if (url.includes('pooler.supabase.com') && url.includes(':5432/')) {
    url = url.replace(':5432/', ':6543/');
  }

  const pool = globalForPrisma.pool ?? new Pool({
    connectionString: url,
    ssl: url.includes('localhost') || url.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
    max: 15,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });

  if (!globalForPrisma.pool) {
    pool.on('error', (err) => {
      console.warn('PG pool background client warning:', err?.message || err);
    });
  }

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

