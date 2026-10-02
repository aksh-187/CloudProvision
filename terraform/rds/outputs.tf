# ─── RDS Module — Outputs ──────────────────────────────────────────────────────
# NOTE: db_password is intentionally NOT included in outputs.
# Passwords must never be exposed via terraform output.

output "db_identifier" {
  description = "The RDS DB instance identifier."
  value       = "" # populated in Phase 10
}

output "db_endpoint" {
  description = "The connection endpoint for the RDS instance (hostname:port)."
  value       = "" # populated in Phase 10
}

output "db_port" {
  description = "The port the database is listening on."
  value       = "" # populated in Phase 10
}

output "db_engine" {
  description = "The database engine."
  value       = var.db_engine
}

output "db_name" {
  description = "The initial database name."
  value       = var.db_name
}

output "region" {
  description = "The AWS region where the RDS instance was created."
  value       = var.aws_region
}

output "job_id" {
  description = "The CloudProvision job ID associated with this resource."
  value       = var.job_id
}
