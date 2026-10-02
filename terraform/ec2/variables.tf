# ─── EC2 Module — Variables ────────────────────────────────────────────────────
# All values are supplied by the provisioning service via terraform.tfvars
# written into the job's isolated working directory.
# Do NOT hardcode values here.

variable "aws_region" {
  description = "AWS region in which to create the EC2 instance."
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "EC2 instance type. Must match the allowlist enforced by the API."
  type        = string
  default     = "t3.micro"

  validation {
    condition = contains([
      "t2.micro", "t2.small", "t2.medium",
      "t3.micro", "t3.small", "t3.medium"
    ], var.instance_type)
    error_message = "instance_type must be one of the allowed types: t2.micro, t2.small, t2.medium, t3.micro, t3.small, t3.medium."
  }
}

variable "instance_name" {
  description = "Name tag applied to the EC2 instance."
  type        = string
  default     = "cloudprovision-ec2"
}

variable "job_id" {
  description = "CloudProvision job ID — applied as a tag for resource tracking."
  type        = string

  validation {
    condition     = length(var.job_id) > 0
    error_message = "job_id must not be empty."
  }
}

variable "user_id" {
  description = "CloudProvision user ID — applied as a tag for ownership tracking."
  type        = string

  validation {
    condition     = length(var.user_id) > 0
    error_message = "user_id must not be empty."
  }
}
