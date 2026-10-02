# ─── S3 Module — Main ─────────────────────────────────────────────────────────
#
# STATUS: Stub — provider configured.
# Full resource implementation added in Phase 8.
#
# IMPORTANT: S3 bucket names are globally unique across ALL AWS accounts.
# The provisioning service generates the bucket name — never hardcode one.
#
# COST: S3 storage costs are minimal for testing (< $0.025/GB/month).
# Empty buckets have no storage cost but may incur request charges.

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

# ── Phase 8: S3 bucket resource will be added here ────────────────────────────
# Resources to be implemented:
#   - aws_s3_bucket                      (bucket creation)
#   - aws_s3_bucket_public_access_block  (block all public access by default)
#   - aws_s3_bucket_versioning           (optional, configurable)
