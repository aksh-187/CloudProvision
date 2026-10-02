# CloudProvision

A self-service infrastructure provisioning platform that lets authenticated users provision and destroy real AWS infrastructure (EC2, S3, RDS) through Terraform — from a web dashboard.

---

## Features

- **Real Terraform provisioning** — EC2 instances, S3 buckets, RDS databases
- **Secure authentication** — bcrypt passwords, persistent SQLite sessions
- **Async job lifecycle** — PENDING → PROVISIONING → READY; frontend polls status
- **Real Terraform outputs** — instance IDs, IPs, ARNs stored and displayed
- **Destroy workflow** — Terraform destroy with ownership enforcement
- **Activity history** — full audit log of all provisioning events
- **Professional dashboard** — dark theme, responsive, no fake data

---

## Architecture

```
Browser (HTML/CSS/Vanilla JS)
        ↓  REST API
Node.js + Express
        ↓  SQL
      SQLite
        ↓  spawn (shell=false)
   Terraform CLI
        ↓  AWS Provider
          AWS (EC2 / S3 / RDS)
```

Each provisioning job gets an isolated Terraform working directory at `terraform_workspaces/<jobId>/`. State is preserved until the resource is successfully destroyed.

---

## Folder Structure

```
cloudprovision/
├── backend/
│   ├── server.js               Entry point
│   ├── app.js                  Express app factory
│   ├── controllers/            authController, provisionController, resourceController
│   ├── routes/                 auth, provision, resources
│   ├── services/               terraformService, provisioningService, activityService
│   ├── middleware/             auth (requireAuth), validate
│   ├── database/               db.js, migrate.js, schema.sql
│   └── utils/                  logger, sanitize (allowlists)
├── frontend/
│   ├── index.html              Auth redirect
│   ├── login.html / signup.html
│   ├── dashboard.html          Stats, provision form, activity
│   ├── resources.html          Resource table, destroy workflow
│   ├── activity.html           Full event log
│   ├── css/                    main.css, dashboard.css
│   └── js/                     api.js, auth.js, provision.js, dashboard.js
├── terraform/
│   ├── ec2/                    Amazon Linux 2023, gp3/encrypted, SG
│   ├── s3/                     Private bucket, SSE-AES256, versioning
│   ├── rds/                    MySQL/PostgreSQL, encrypted, no public access
│   └── combined/               Multi-resource placeholder
├── terraform_workspaces/       Runtime job directories (gitignored)
├── tests/                      Jest test suites
├── .github/workflows/          CI (Node tests) + Terraform validation
├── .env.example                Environment variable template
└── README.md
```

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | ≥ 18 | Backend runtime |
| npm | ≥ 9 | Package manager |
| Terraform | ≥ 1.5 | Infrastructure provisioning |
| AWS CLI v2 | any | Credential configuration |
| Git | any | Version control |

---

## Installation

```bash
git clone <repo-url>
cd cloudprovision
npm install
```

---

## Environment Configuration

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
NODE_ENV=development
SESSION_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
DATABASE_PATH=./backend/database/cloudprovision.sqlite
AWS_REGION=us-east-1
TERRAFORM_WORKSPACES_PATH=./terraform_workspaces
# If terraform is not on PATH (e.g. Windows):
TERRAFORM_BIN=C:\Terraform\terraform.exe
```

**Never commit `.env`** — it is gitignored.

---

## AWS Credential Setup

CloudProvision uses the standard AWS credential chain. Configure with:

```bash
aws configure
```

Enter your Access Key ID, Secret Access Key, and default region.

The IAM user/role needs at minimum:
- `ec2:*` (scoped to your region)
- `s3:*`
- `rds:*`

Credentials are **never hardcoded** — Terraform inherits them from the environment.

---

## Terraform Setup

Terraform must be installed and available. Verify:

```bash
terraform version  # should show >= 1.5
```

If Terraform is not on your PATH, set `TERRAFORM_BIN` in `.env`.

Validate the modules locally:

```bash
# EC2
cd terraform/ec2 && terraform init -backend=false && terraform validate

# S3
cd ../s3 && terraform init -backend=false && terraform validate

# RDS
cd ../rds && terraform init -backend=false && terraform validate
```

---

## Running Locally

```bash
npm start
```

Or with auto-reload during development:

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## Provisioning Workflow

1. Sign up / log in
2. Click a resource type (EC2 / S3 / RDS)
3. Fill in the configuration form
4. Click **Provision**
5. The API returns a `jobId` immediately (HTTP 202)
6. The frontend polls `GET /api/status/:jobId` every 3 seconds
7. Status progresses: `PENDING → PROVISIONING → READY`
8. Real Terraform outputs (instance ID, IP, ARN, endpoint) appear in the dashboard
9. To destroy: click **Destroy** on the Resources page and confirm

---

## Destroy Workflow

1. Navigate to **Resources**
2. Click **Destroy** next to a READY resource
3. Confirm in the dialog
4. Status changes to `DESTROYING`
5. `terraform destroy -auto-approve` runs against the job's isolated state
6. Status reaches `DESTROYED` on success
7. Working directory is cleaned up

---

## API Endpoints

### Authentication

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/login`  | Sign in |
| POST | `/api/auth/logout` | Sign out |
| GET  | `/api/auth/me`     | Current user |

### Provisioning

| Method | Path | Description |
|---|---|---|
| POST | `/api/provision`          | Create job, start async Terraform |
| GET  | `/api/status/:jobId`      | Job + resource status |
| POST | `/api/destroy/:jobId`     | Trigger Terraform destroy |

### Resources & Activity

| Method | Path | Description |
|---|---|---|
| GET | `/api/resources` | List user's resources |
| GET | `/api/activity`  | List user's activity log |
| GET | `/api/stats`     | Dashboard stats (total/active/etc.) |

### Other

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Service health check |

---

## Testing

```bash
npm test
```

Runs all Jest test suites with isolated SQLite databases. Terraform subprocess calls are mocked — no AWS credentials needed.

```bash
npm run test:coverage
```

Test coverage report.

---

## GitHub Actions

- **CI** (`.github/workflows/ci.yml`): runs on every push/PR — installs deps, security audit, Jest tests
- **Terraform** (`.github/workflows/terraform.yml`): runs on Terraform file changes — fmt check, init, validate

Neither workflow runs `terraform apply` or `terraform destroy`.

---

## Security

- Passwords hashed with bcrypt (12 rounds)
- Sessions stored in SQLite, secret from `SESSION_SECRET` env var
- HttpOnly, SameSite=Lax cookies
- All protected endpoints require authentication
- Ownership verified server-side on every provisioning/destroy operation
- Terraform subprocess uses `shell: false` + discrete argument arrays — no injection possible
- All user-supplied infrastructure parameters validated against allowlists before reaching Terraform
- `.env`, `*.sqlite`, `*.tfstate`, `terraform_workspaces/` all gitignored
- No secrets in API responses, logs, or Terraform outputs

---

## AWS Cost Warnings

| Resource | Cost | Notes |
|---|---|---|
| EC2 t3.micro | ~$0.0104/hr | Free tier: 750 hrs/month (new accounts) |
| S3 bucket | ~$0.023/GB/month | Empty buckets are essentially free |
| RDS db.t3.micro | ~$0.017/hr | Free tier: 750 hrs/month (new accounts) |

**Always destroy resources after testing.** The destroy workflow in CloudProvision handles this.

---

## Troubleshooting

**Server won't start**
- Check `.env` exists with `SESSION_SECRET` set
- Run `npm install` if `node_modules` is missing

**Terraform not found**
- Set `TERRAFORM_BIN` in `.env` to the full path (e.g. `C:\Terraform\terraform.exe`)

**Provisioning stuck at PENDING**
- Terraform binary path is wrong — check `TERRAFORM_BIN`
- AWS credentials not configured — run `aws configure`

**Provisioning FAILED immediately**
- Check the error message on the Resources page or in `terraform_workspaces/<jobId>/job.log`
- Confirm default VPC exists: `aws ec2 describe-vpcs --filters Name=isDefault,Values=true`

**Jobs stuck at PROVISIONING after server restart**
- Handled automatically: server startup reconciliation marks them FAILED

---

## Manual E2E Demo

Prerequisites: AWS credentials configured, Terraform installed, `.env` set.

```
1. npm start
2. Open http://localhost:3000
3. Create an account
4. Log in
5. Select EC2 → t3.micro → us-east-1 → Provision
6. Observe: PENDING → PROVISIONING → READY
7. Note real instance ID and public IP in the dashboard
8. Verify in AWS Console: EC2 → Instances
9. Click Resources → Destroy → Confirm
10. Observe: DESTROYING → DESTROYED
11. Verify in AWS Console: instance terminated
```

---

## Known Limitations

- Single-server deployment — Terraform state is local, not shared (no S3 remote state)
- No multi-user admin view — each user sees only their own resources
- RDS provisioning takes 5–10 minutes — this is normal AWS behaviour
- S3 bucket names must be globally unique — the service auto-generates them
- No SSH key injection for EC2 (security group has no inbound rules by default)
- GitHub Actions Terraform plan step requires `ENABLE_TERRAFORM_PLAN=true` repository variable and AWS secrets to be configured
