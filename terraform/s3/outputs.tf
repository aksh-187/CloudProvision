# ─── S3 Module — Outputs ───────────────────────────────────────────────────────

output "bucket_name" {
  description = "The name of the created S3 bucket."
  value       = aws_s3_bucket.bucket.bucket
}

output "bucket_arn" {
  description = "The ARN of the S3 bucket."
  value       = aws_s3_bucket.bucket.arn
}

output "bucket_region" {
  description = "The AWS region where the bucket was created."
  value       = aws_s3_bucket.bucket.region
}

output "bucket_domain_name" {
  description = "The bucket domain name."
  value       = aws_s3_bucket.bucket.bucket_domain_name
}

output "versioning_enabled" {
  description = "Whether versioning is enabled."
  value       = var.versioning_enabled
}

output "region" {
  description = "AWS region."
  value       = var.aws_region
}

output "job_id" {
  description = "CloudProvision job ID."
  value       = var.job_id
}
