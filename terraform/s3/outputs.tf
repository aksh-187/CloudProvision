# ─── S3 Module — Outputs ───────────────────────────────────────────────────────

output "bucket_name" {
  description = "The name of the created S3 bucket."
  value       = "" # populated in Phase 8
}

output "bucket_arn" {
  description = "The ARN of the created S3 bucket."
  value       = "" # populated in Phase 8
}

output "bucket_region" {
  description = "The AWS region where the bucket was created."
  value       = var.aws_region
}

output "job_id" {
  description = "The CloudProvision job ID associated with this resource."
  value       = var.job_id
}
