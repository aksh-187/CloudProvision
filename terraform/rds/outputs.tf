# ─── RDS Module — Outputs ──────────────────────────────────────────────────────
# NOTE: db_password is intentionally excluded — never expose credentials in outputs.

output "db_identifier" {
  description = "The RDS DB instance identifier."
  value       = aws_db_instance.rds.identifier
}

output "db_endpoint" {
  description = "The connection endpoint (hostname only, no port)."
  value       = aws_db_instance.rds.address
}

output "db_port" {
  description = "The port the database is listening on."
  value       = aws_db_instance.rds.port
}

output "db_engine" {
  description = "The database engine."
  value       = aws_db_instance.rds.engine
}

output "db_engine_version" {
  description = "The database engine version."
  value       = aws_db_instance.rds.engine_version_actual
}

output "db_name" {
  description = "The initial database name."
  value       = aws_db_instance.rds.db_name
}

output "db_instance_class" {
  description = "The RDS instance class."
  value       = aws_db_instance.rds.instance_class
}

output "db_username" {
  description = "The master username (not the password)."
  value       = aws_db_instance.rds.username
  sensitive   = true
}

output "region" {
  description = "The AWS region."
  value       = var.aws_region
}

output "job_id" {
  description = "CloudProvision job ID."
  value       = var.job_id
}
