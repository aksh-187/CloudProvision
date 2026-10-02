# ─── RDS Module — Main ────────────────────────────────────────────────────────
#
# STATUS: Stub — provider configured.
# Full resource implementation added in Phase 10.
#
# ⚠️  COST WARNING: RDS instances incur ongoing AWS charges even when idle.
#     db.t3.micro: ~$0.017/hour (~$12.40/month outside free tier).
#     Free tier: 750 hours of db.t3.micro per month for 12 months (new accounts).
#     ALWAYS run `terraform destroy` after testing to stop charges.
#
# ⚠️  SECURITY WARNING: RDS master credentials are written to Terraform state.
#     The state file (terraform.tfstate) must be stored securely.
#     It is gitignored and must NEVER be committed to version control.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      ManagedBy = "CloudProvision"
      JobId     = var.job_id
      UserId    = var.user_id
    }
  }
}

# ── Phase 10: RDS instance resource will be added here ────────────────────────
# Resources to be implemented:
#   - aws_db_subnet_group     (using default VPC subnets)
#   - aws_security_group      (restrict DB port to application tier only)
#   - aws_db_instance         (MySQL or PostgreSQL, single-AZ, no Multi-AZ for cost)
#
# Configuration choices for MVP (low cost, suitable for demo):
#   - allocated_storage    = 20 (GB, minimum)
#   - storage_type         = "gp2"
#   - multi_az             = false
#   - publicly_accessible  = false (access via security group only)
#   - skip_final_snapshot  = true  (for easy teardown in demo environment)
#   - deletion_protection  = false (for easy teardown in demo environment)
