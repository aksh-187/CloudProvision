# ─── RDS Module — Main ────────────────────────────────────────────────────────
#
# Provisions a single RDS instance into the default VPC.
#
# ⚠️  COST WARNING:
#   db.t3.micro: ~$0.017/hour (~$12.40/month outside free tier).
#   Free tier: 750 hours of db.t3.micro per month for 12 months (new accounts).
#   ALWAYS run `terraform destroy` after testing to stop charges.
#
# ⚠️  SECURITY WARNING:
#   Master credentials are written to Terraform state (terraform.tfstate).
#   State files are gitignored and must never be committed or shared.
#   The provisioning service generates credentials at runtime.
#
# ⚠️  PREREQUISITES:
#   A default VPC with at least 2 subnets in different AZs must exist.

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

# ── Default VPC and subnets ────────────────────────────────────────────────────

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# ── DB Subnet group ────────────────────────────────────────────────────────────
resource "aws_db_subnet_group" "rds" {
  name        = "cloudprovision-rds-${var.job_id}"
  description = "CloudProvision subnet group for job ${var.job_id}"
  subnet_ids  = data.aws_subnets.default.ids

  tags = {
    Name = "cloudprovision-rds-${var.job_id}"
  }
}

# ── Security group ─────────────────────────────────────────────────────────────
# No inbound access from the public internet.
# In a real production setup, restrict to the application server's security group.
resource "aws_security_group" "rds" {
  name        = "cloudprovision-rds-sg-${var.job_id}"
  description = "CloudProvision RDS security group for job ${var.job_id}"
  vpc_id      = data.aws_vpc.default.id

  # No inbound rules — database is not publicly accessible
  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "cloudprovision-rds-sg-${var.job_id}"
  }
}

# ── Engine version locals ──────────────────────────────────────────────────────
locals {
  engine_version = var.db_engine_version != "" ? var.db_engine_version : (
    var.db_engine == "mysql" ? "8.0" :
    var.db_engine == "postgres" ? "15" : ""
  )

  port = var.db_engine == "postgres" ? 5432 : 3306
}

# ── RDS Instance ───────────────────────────────────────────────────────────────
resource "aws_db_instance" "rds" {
  identifier        = var.db_identifier
  engine            = var.db_engine
  engine_version    = local.engine_version
  instance_class    = var.db_instance_class
  allocated_storage = var.db_allocated_storage
  storage_type      = "gp2"
  storage_encrypted = true

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password
  port     = local.port

  db_subnet_group_name   = aws_db_subnet_group.rds.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  # Not publicly accessible — security best practice
  publicly_accessible = false
  multi_az            = var.multi_az

  # Demo/dev settings — faster creation and teardown
  skip_final_snapshot     = true
  deletion_protection     = false
  backup_retention_period = 0

  tags = {
    Name = var.db_identifier
  }
}
