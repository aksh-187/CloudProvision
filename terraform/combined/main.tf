# ─── Combined Module — Main ───────────────────────────────────────────────────
#
# STATUS: Placeholder — not yet implemented.
# This module is reserved for combined multi-resource deployments (e.g. EC2 + S3).
# Individual modules in ec2/, s3/, and rds/ are used for Phases 4–10.

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
