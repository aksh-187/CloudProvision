# ─── RDS Module — Variables ────────────────────────────────────────────────────

variable "aws_region" {
  description = "AWS region for the RDS instance."
  type        = string
  default     = "us-east-1"
}

variable "db_identifier" {
  description = "Unique identifier for the RDS DB instance."
  type        = string
}

variable "db_engine" {
  description = "Database engine. Allowed values: mysql, postgres."
  type        = string
  default     = "mysql"

  validation {
    condition     = contains(["mysql", "postgres"], var.db_engine)
    error_message = "db_engine must be 'mysql' or 'postgres'."
  }
}

variable "db_instance_class" {
  description = "RDS instance class. Use db.t3.micro for low-cost testing."
  type        = string
  default     = "db.t3.micro"
}

variable "db_name" {
  description = "Name of the initial database to create."
  type        = string
  default     = "appdb"
}

variable "db_username" {
  description = "Master username for the database. Do NOT use 'admin' or 'root'."
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = <<-EOT
    Master password for the database.
    SECURITY: This value appears in Terraform state. The state file must be
    stored securely and must never be committed to version control.
    Generated and injected by the provisioning service — never hardcoded.
  EOT
  type        = string
  sensitive   = true
}

variable "job_id" {
  description = "CloudProvision job ID — used as a tag for resource tracking."
  type        = string
}

variable "user_id" {
  description = "CloudProvision user ID — used as a tag for ownership tracking."
  type        = string
}
