# Database Setup Guide

Shopii API supports two database modes: **Local SQLite** (for development) and **Remote Supabase PostgreSQL** (for production/shared development).

## Quick Start

### Option 1: Local SQLite (Default)

Best for local development without internet dependency.

```bash
cd api

# 1. Ensure DB_MODE=local in your .env file
# DB_MODE=local

# 2. Run setup
npm run setup:local

# 3. View your database
npm run db:studio:local
```

Your database will be stored at `api/prisma/dev.db`.

### Option 2: Remote Supabase PostgreSQL

Best for production or when working with a team on shared data.

```bash
cd api

# 1. Get your Supabase connection string
# Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/settings/database
# Copy the "Connection string" under "Connection pooling" or "Direct connection"

# 2. Update your .env file
DB_MODE=remote
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.wdsvtcithgbvzukfzgna.supabase.co:5432/postgres"

# 3. Run setup
npm run setup:remote

# 4. View your database
npm run db:studio:remote
```

## Configuration

### Environment Variables

In `api/.env`:

```bash
# Set to 'local' or 'remote'
DB_MODE=local

# Only needed when DB_MODE=remote
DATABASE_URL="postgresql://postgres:password@db.your-project.supabase.co:5432/postgres"
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run setup:local` | Generate Prisma client, initialize local SQLite database, and seed data |
| `npm run setup:remote` | Generate Prisma client, initialize remote Supabase database, and seed data |
| `npm run db:studio:local` | Open Prisma Studio for local SQLite database |
| `npm run db:studio:remote` | Open Prisma Studio for remote PostgreSQL database |
| `npm run db:generate:local` | Generate Prisma client for local SQLite schema |
| `npm run db:generate:remote` | Generate Prisma client for remote PostgreSQL schema |
| `npm run db:push:local` | Push schema changes to local SQLite |
| `npm run db:push:remote` | Push schema changes to remote PostgreSQL |
| `npm run db:seed` | Seed the database with sample data |

## Schema Files

- **`prisma/schema.dev.prisma`** - SQLite schema for local development
  - Uses SQLite-specific types (String for JSON, Float for decimals)
  - Stored in `prisma/dev.db`

- **`prisma/schema.prisma`** - PostgreSQL schema for production
  - Uses PostgreSQL-specific types (Json, Decimal, UUID)
  - Connected via `DATABASE_URL` environment variable

## Switching Between Modes

### From Local to Remote

1. Update `.env`:
   ```bash
   DB_MODE=remote
   DATABASE_URL="postgresql://postgres:your-password@..."
   ```

2. Push schema and seed:
   ```bash
   npm run setup:remote
   ```

### From Remote to Local

1. Update `.env`:
   ```bash
   DB_MODE=local
   ```

2. Your local database at `prisma/dev.db` will be used automatically

## Troubleshooting

### "Environment variable not found: DATABASE_URL"

- Make sure you have `DATABASE_URL` set in your `.env` file when using `DB_MODE=remote`

### "Can't reach database server"

- Check that your Supabase connection string is correct
- Verify you have internet connection
- Ensure your IP is allowed in Supabase (some projects restrict connections)

### "Schema drift detected"

- Run `npm run db:push:dev` (for local) or `npm run db:push` (for remote) to sync schema

## Getting Supabase Connection String

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Settings** → **Database**
4. Scroll to **Connection string**
5. **Important:** Use "Connection pooling" (Session mode) instead of "Direct connection"
   - This uses port 6543 instead of 5432 and works better with Prisma and restricted networks
6. Choose "URI" format
7. Copy the string and replace `[YOUR-PASSWORD]` with your actual database password

The format should be:
```
# Connection Pooling (Recommended - works in more network environments)
postgresql://postgres.PROJECT_REF:YOUR_PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres

# OR Direct Connection (may not work in restricted networks like WSL/VPN/firewalls)
postgresql://postgres:YOUR_PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
```

## Notes

- The `DB_MODE` variable is for your reference - the actual mode is determined by which schema/scripts you use
- Both databases use the same seed data from `prisma/seed.ts`
- Local SQLite is faster but lacks some PostgreSQL features (native JSON, UUID, etc.)
- Remote PostgreSQL is required for production deployment
