# After-school.tech backend

Express + Mongo API for auth, studio, wallet, missions, pride, store, and lesson interactions.

## Setup

Use **npm** (this repo’s lockfile).

```bash
npm install
cp .env.example .env
```

Set `MONGODB_URI` and `JWT_SECRET` (same secret as `ast4-lesson-builder`). Superadmin credentials are env-only.

```bash
npm run dev
```

Listens on `PORT` or `5001`. `GET /health` pings Mongo.

```bash
npm test
```

Env is validated on boot (`helpers/env.js`). Missing `JWT_SECRET` or `MONGODB_URI` refuses to start.

## Architecture

Work order and ADRs live next to the frontend:

- [`../IMPLEMENTATION_ORDER.md`](../IMPLEMENTATION_ORDER.md)
- [`../ast4-lesson-builder/docs/adr/`](../ast4-lesson-builder/docs/adr/)
