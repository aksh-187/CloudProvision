# ─── Combined Module — Variables ──────────────────────────────────────────────
# Placeholder for a combined multi-resource deployment.
# Full implementation is deferred — individual modules (ec2/, s3/, rds/) are
# used for all Phase 4–10 work.

variable "aws_region" {
  description = "AWS region for all resources in this combined deployment."
  type        = string
  default     = "us-east-1"
}

variable "job_id" {
  description = "CloudProvision job ID."
  type        = string
  default     = ""
}

variable "user_id" {
  description = "CloudProvision user ID."
  type        = string
  default     = ""
}
