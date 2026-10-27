# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**Teele Abi** is a Next.js web application. The user interface is entirely in Estonian.

- GitHub repository: `bela-me/teele-abi`, branch `main`.
- Work in this existing repository and branch. Do not create a new repository.

## Tech stack

- Next.js with the **App Router** (`app/` directory)
- **TypeScript**
- **Tailwind CSS**
- **Prisma ORM** with PostgreSQL

## Hosting and database

- The application is hosted on **Render**. Do not use Railway or add Railway configuration.
- The PostgreSQL database **`teele-abi-db`** already exists on Render. Do not create another database.
- Read the connection string only from the `DATABASE_URL` environment variable (e.g. `env("DATABASE_URL")` in `prisma/schema.prisma`).
- Do not set up a local database or run a local server (no Docker Postgres, no `npm run dev` for local hosting).

## Secrets

- Never hard-code credentials, connection strings, API keys or tokens.
- Never commit `.env` files or other secrets. Keep them in `.gitignore`.
- A `.env.example` with placeholder values (no real secrets) is fine.

## Data

- `data/support_templates.csv` already exists. Preserve it: do not delete, rename or overwrite it. Columns: `category`, `example_issue`, `template_reply`.
- Use only fictional demonstration data. No real personal data, real users or real case details.

## Language

- All user-facing text (pages, labels, buttons, error messages, metadata) must be in Estonian.
- Set `<html lang="et">`.
- Code, identifiers and code comments may be in English.

## Workflow

- Once `package.json` with a `build` script exists, run `npm run build` before pushing application code, and push only if it succeeds.
- Do not commit or push without the user's approval.
