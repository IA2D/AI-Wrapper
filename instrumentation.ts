export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureDatabaseSchema } = await import('./lib/db');
    await ensureDatabaseSchema();
  }
}
