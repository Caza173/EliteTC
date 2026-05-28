# EliteTC

Transaction Coordinator platform. Stack and AWS deployment pattern mirror
[EliteGCI](https://github.com/Caza173/elitegci), but EliteTC runs as its own
app with its own AWS resources, database, and DNS. **No runtime dependencies
on EliteGCI** — only the architecture is shared.

## Stack

- Node.js 20 + Express 5 + TypeScript (ESM source, bundled to a single CJS
  file for production)
- React 18 + Vite + Tailwind on the client
- PostgreSQL 16 (AWS RDS, `db.t4g.micro` in production)
- Drizzle ORM + idempotent SQL bootstrap on container start
- AWS S3 for document storage, AWS Textract for OCR, OpenAI for contract
  field extraction
- AWS SES (us-east-1) for transactional email
- Auth: Google Sign-In (primary), SES magic-link (secondary), dev-login for
  local development only

## Local development

```bash
cp .env.example .env       # fill in DATABASE_URL at minimum
npm install
npm run dev
```

Visit http://localhost:5000. `/api/diagnostics` reports which integrations
are wired in (requires an authenticated session — sign in via dev-login,
Google, or magic-link first).

You can run without S3 / OpenAI / SES credentials — set `SKIP_S3_UPLOAD=true`
and the relevant keys empty in `.env`, and the app degrades gracefully.

## Production build

```bash
npm run build              # vite build + esbuild bundle to dist/index.cjs
NODE_ENV=production node dist/index.cjs
```

## AWS architecture

EliteTC reuses the EliteGCI AWS account but lives entirely on separate
resources. All names are prefixed `elitetc-` so they sort next to EliteGCI
in the console without colliding.

| Resource | EliteGCI | EliteTC |
| --- | --- | --- |
| ECR repository | `elitegci` | `elitetc` |
| ECS cluster | `elitegci` | `elitetc` |
| ECS service | `elitegci` (Express Mode) | `elitetc` (Express Mode) |
| RDS instance | `elitegci-db` | `elitetc-db` |
| RDS DB name | `elitegci` | `elitetc` |
| S3 bucket (docs) | n/a | `elitetc-documents` |
| Security group | `elitegci-sg` | `elitetc-sg` |
| IAM role (deploy) | `elitegci-github-actions-deploy` | `elitetc-github-actions-deploy` |
| IAM role (task) | `ecsTaskExecutionRole` (shared) | `elitetc-ecs-task-role` (S3+Textract scoped) |
| ALB / target group | managed by ECS Express Mode | managed by ECS Express Mode |
| Custom domain | `app.elitegci.com` | `app.elitetc.com` (suggested) |
| Cloudflare proxy | **off — DNS only** (WebSockets + ALB health checks broke under proxy) | **off — DNS only** (same reason) |

### Why ECS Express Mode

EliteGCI had recurring 503s during deploys because the ALB listener flipped
between blue/green target groups and sometimes pointed at an empty target
group. ECS Express Mode manages a single stable service + target group, so
in-flight requests during a rollout drain cleanly instead of being shipped
to an empty TG. EliteTC ships on Express Mode from day one for the same
reason.

The container exposes two health endpoints:

- `/healthz` — returns 200 immediately, even while bootstrap is running.
  This is the ALB target-group health check. The container is considered
  alive as soon as the HTTP listener is up.
- `/ready` — returns 200 only after `registerRoutes()` (including schema
  bootstrap) completes. Use this for app-level readiness probes; ECS will
  roll-replace any task whose bootstrap hangs.

### Postgres SSL

RDS requires TLS. Node's default trust store (Mozilla) does not include
Amazon's RDS root CA, so pg throws `self-signed certificate in certificate
chain` without intervention. The runtime image bakes in the AWS RDS Global
Root bundle at `/etc/ssl/rds-global-bundle.pem` and sets
`PG_CA_CERT_PATH` so `server/db.ts` verifies the cert chain properly.

`server/db.ts` also strips `sslmode=` out of `DATABASE_URL` before passing
it to pg, because `pg-connection-string` parses that param and applies its
own SSL semantics that override the explicit `ssl` option in some versions.

## GitHub Actions deploy workflow

`.github/workflows/deploy.yml` builds the image, pushes to ECR, and rolls
out an ECS Express Mode service via OIDC federation (no long-lived AWS
keys in GitHub).

### Repo-level GitHub Variables

Set these under **Settings → Secrets and variables → Actions → Variables**:

| Variable | Example | Purpose |
| --- | --- | --- |
| `AWS_ACCOUNT_ID` | `655738707673` | Same account as EliteGCI |
| `TASK_SECURITY_GROUP` | `sg-0abc123...` | EliteTC-specific SG; **not** the EliteGCI SG |
| `S3_DOCUMENTS_BUCKET` | `elitetc-documents` | Document storage bucket |
| `APP_BASE_URL` | `https://app.elitetc.com` | Used in magic-link emails |

### Repo-level GitHub Secrets

Set these under **Settings → Secrets and variables → Actions → Secrets**:

| Secret | Notes |
| --- | --- |
| `DATABASE_URL` | `postgres://USER:PASS@elitetc-db.XXX.us-east-1.rds.amazonaws.com:5432/elitetc?sslmode=require` |
| `OPENAI_API_KEY` | For contract field extraction |
| `GOOGLE_CLIENT_ID` | Google OAuth client (sign-in) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `SES_FROM_EMAIL` | Verified sender in `us-east-1` (e.g. `no-reply@elitetc.com`) |

## Manual AWS console steps (one-time bootstrap)

These are not automated by the workflow — provision them in the console
or via Terraform/CloudFormation if you maintain IaC elsewhere.

1. **IAM OIDC provider for GitHub Actions** — already exists in the
   shared account from EliteGCI; reuse it.
2. **IAM role `elitetc-github-actions-deploy`** — trust policy permits
   the GitHub OIDC provider for `repo:Caza173/EliteTC:*`. Attach
   `AmazonECR-FullAccess`, `AmazonECS_FullAccess`, and an inline policy
   permitting `iam:PassRole` on the task and execution roles.
3. **IAM role `elitetc-ecs-task-role`** — attached to the ECS task at
   runtime. Permissions: `s3:GetObject`/`s3:PutObject` scoped to
   `arn:aws:s3:::elitetc-documents/*`, `textract:DetectDocumentText`,
   `ses:SendEmail` on the verified identity, and CloudWatch Logs write.
4. **ECR repository `elitetc`** in `us-east-1`. Lifecycle rule: keep last
   20 tagged images, expire untagged after 7 days.
5. **ECS cluster `elitetc`** (Fargate). Express Mode service is created
   automatically on first workflow run.
6. **RDS Postgres 16 `elitetc-db`** — `db.t4g.micro`, single-AZ, SSL
   enforced, 20 GiB gp3, deletion protection ON, automated backups 7 days.
   Initial DB name `elitetc`, master username `elitetc`. Place in the
   same VPC as the ECS service and assign the EliteTC security group.
7. **Security group `elitetc-sg`** — used by both the ECS task and the
   RDS instance. After the first deploy, add a self-reference inbound
   rule on TCP 5432 so the task can reach RDS.
8. **S3 bucket `elitetc-documents`** — encryption: SSE-S3, versioning ON,
   block all public access, lifecycle: transition to IA at 30 days.
9. **SES verified identity** — verify `no-reply@elitetc.com` (or the
   chosen sender) in `us-east-1`. If you are still in the SES sandbox,
   also verify recipient addresses for testing.
10. **Cloudflare DNS** — create an `A`/`ALIAS` record for `app.elitetc.com`
    pointing at the ALB DNS name. **Set proxy status to DNS-only.**
    The Cloudflare proxy broke WebSockets + ALB health checks for
    EliteGCI; same constraint applies here.

## Schema bootstrap and migrations

`server/storage.ts` runs an idempotent `CREATE TABLE IF NOT EXISTS` block on
container start. This is enough for first deploy and for replicas that join
later. For schema changes:

1. Update `shared/schema.ts`.
2. Run `npm run db:generate` locally to produce a Drizzle migration in
   `migrations/`.
3. Apply with `npm run db:push` against a staging DB to verify.
4. Commit the migration. The next deploy will pick it up. Drizzle migration
   files are additive — never edit a migration that has been deployed.

## Repo layout

```
client/          React + Vite SPA
server/          Express API
  index.ts       entry, health endpoints, async bootstrap
  routes.ts      /api/* handlers
  db.ts          pg pool + RDS SSL config
  storage.ts     data access + idempotent schema bootstrap
  auth.ts        cookie sessions, attachUser, requireAuth
  s3.ts          S3 upload + presigned URLs
  ocr.ts         AWS Textract wrapper
  openai-parse.ts OpenAI contract field extraction
  email.ts       SES wrapper + magic-link
  static.ts      production SPA serving
  vite.ts        dev-only Vite middleware
shared/
  schema.ts      Drizzle schema (single source of truth)
script/
  build.ts       vite build + esbuild bundle
Dockerfile       multi-stage build, RDS CA bundle baked in
.github/workflows/
  ci.yml         lint/typecheck/build on PRs
  deploy.yml     ECR push + ECS Express Mode deploy on main
```
