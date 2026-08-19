import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';

/**
 * Asserts the netra_ro Postgres role cannot mutate the database — the
 * database-level enforcement described in PROJECT_PLAN.md §4.3. This is the
 * first line of defence; application code is never allowed to be the only
 * thing standing between a user and a write.
 *
 * This test must never be deleted or weakened. If it fails, fix the
 * `db/init/01-readonly-role.sql` grants — never the test.
 *
 * Requires a running Postgres with the netra_ro role provisioned
 * (`docker compose up -d`). Reads its connection string from DATABASE_URL.
 */
describe('netra_ro read-only enforcement', () => {
  let client: Client | undefined;

  beforeAll(async () => {
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is not set. This integration test needs a live Postgres ' +
          'connection as netra_ro — run `docker compose up -d` and set DATABASE_URL first.',
      );
    }
    client = new Client({ connectionString });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it('rejects INSERT', async () => {
    await expect(
      client!.query('INSERT INTO customers (id) VALUES ($1)', ['test-insert']),
    ).rejects.toThrow(/permission denied|read-only/i);
  });

  it('rejects UPDATE', async () => {
    await expect(
      client!.query('UPDATE customers SET id = $1 WHERE id = $1', ['test-update']),
    ).rejects.toThrow(/permission denied|read-only/i);
  });

  it('rejects DELETE', async () => {
    await expect(
      client!.query('DELETE FROM customers WHERE id = $1', ['test-delete']),
    ).rejects.toThrow(/permission denied|read-only/i);
  });

  it('rejects CREATE TABLE', async () => {
    await expect(
      client!.query('CREATE TABLE netra_ro_should_not_create (id serial primary key)'),
    ).rejects.toThrow(/permission denied|read-only/i);
  });

  it('rejects DROP TABLE', async () => {
    await expect(client!.query('DROP TABLE customers')).rejects.toThrow(
      /permission denied|read-only/i,
    );
  });
});
