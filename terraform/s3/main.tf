# ─── S3 Module — Main ─────────────────────────────────────────────────────────
#
# Provisions a single S3 bucket with:
#   - server-side encryption (AES256)
#   - all public access blocked
#   - optional versioning
#   - no lifecycle rules (MVP)
#
# ⚠️  BUCKET NAMES are globally unique across all AWS accounts.
#     The provisioning service generates the name — never hardcode one.
#
# ⚠️  COST: S3 storage is ~$0.023/GB/month. Empty buckets have no storage cost
#     but may incur minimal request charges. Destroy when done testing.

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

# ── S3 Bucket ──────────────────────────────────────────────────────────────────

resource "aws_s3_bucket" "bucket" {
  bucket = var.bucket_name

  tags = {
    Name = var.bucket_name
  }

  # Prevent accidental deletion during normal lifecycle management
  # Set to false so CloudProvision destroy can remove it
  force_destroy = false
}

# ── Block all public access ────────────────────────────────────────────────────
# Default: bucket is completely private. No public ACLs or policies allowed.
resource "aws_s3_bucket_public_access_block" "block" {
  bucket = aws_s3_bucket.bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── Server-side encryption ─────────────────────────────────────────────────────
# AES256 (SSE-S3) — no additional cost, encrypts all objects at rest.
resource "aws_s3_bucket_server_side_encryption_configuration" "sse" {
  bucket = aws_s3_bucket.bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# ── Versioning (optional) ──────────────────────────────────────────────────────
resource "aws_s3_bucket_versioning" "versioning" {
  bucket = aws_s3_bucket.bucket.id

  versioning_configuration {
    status = var.versioning_enabled ? "Enabled" : "Suspended"
  }
}
