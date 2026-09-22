# database/

This folder holds everything about the SQLite database, separate from the
server code:

| File                     | Purpose                                                        |
| ------------------------ | -------------------------------------------------------------- |
| `unithrift.sqlite`   | The actual database (auto-created + seeded on first server run) |
| `schema.sql`             | All `CREATE TABLE` / `CREATE INDEX` DDL                         |
| `README.md`              | This file                                                       |

## How it works

- `lib/db.js` opens `unithrift.sqlite` and applies `schema.sql` on every
  start (idempotent — `CREATE TABLE IF NOT EXISTS`).
- Seed data stays in `lib/db.js` (not SQL) because passwords are hashed at
  runtime with `scrypt`.

## Start fresh / re-seed

1. Stop the server.
2. Delete `unithrift.sqlite` (plus any `-wal` / `-shm` side files).
3. Start the server — the DB is recreated and seeded automatically.

## Custom location

Set the `CT_DB` environment variable to use a database file anywhere else,
e.g. `$env:CT_DB = 'D:\data\unithrift.sqlite'`.