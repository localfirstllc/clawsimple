# Drizzle Migration Pitfall: Handwritten SQL Not Applied

## What happened
We added a manual SQL file `drizzle/0004_add_install_session_display_name.sql` and then ran `pnpm drizzle-kit migrate`, but the column never appeared in the database. The API failed with:

> `column "display_name" does not exist`

## Why the manual file was ignored
`drizzle-kit migrate` does **not** execute every `.sql` file it finds in the `drizzle/` folder. It only runs migrations that are tracked in the Drizzle **meta journal**:

- `drizzle/meta/_journal.json`

When you run:

```
pnpm drizzle-kit generate --name <migration_name>
```

Drizzle does two things:
1. Creates the SQL file in `drizzle/`
2. Updates the meta journal so `migrate` knows the file exists and should be applied

Because we **handwrote the SQL file**, the journal **never referenced it**, so `migrate` skipped it.

## Correct workflow
Always generate migrations via Drizzle so the journal is consistent:

```
pnpm drizzle-kit generate --name add_install_session_display_name
pnpm drizzle-kit migrate
```

## Quick fix if it already happened
If you already deployed and the column is missing:

```
ALTER TABLE "install_sessions" ADD COLUMN "display_name" text;
```

Then regenerate a proper migration (to keep local history consistent).
