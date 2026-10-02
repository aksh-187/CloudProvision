# ─── EC2 Module — Main ────────────────────────────────────────────────────────
#
# Provisions a single EC2 instance into the default VPC.
# Each CloudProvision job runs this module in its own isolated working directory
# so Terraform state is never shared between jobs or users.
#
# ⚠️  COST WARNING:
#   t3.micro: free-tier eligible (750 hrs/month, new AWS accounts only).
#   Always run `terraform destroy` when done testing.
#   CloudProvision's destroy workflow automates this.
#
# ⚠️  PREREQUISITES:
#   A default VPC must exist in the target region.
#   The provisioning service checks for this before creating a job.
#   AWS credentials must be configured via the standard credential chain
#   (aws configure / environment variables / IAM role) — never hardcoded here.

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

# ── Data sources ───────────────────────────────────────────────────────────────

# Resolve the latest Amazon Linux 2023 AMI for the target region.
# Using a data source ensures we always get the current AMI without hardcoding
# region-specific AMI IDs. Amazon Linux 2023 is the AWS-recommended base image.
data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

# Fetch the default VPC so we can attach the security group and instance to it.
data "aws_vpc" "default" {
  default = true
}

# ── Security group ─────────────────────────────────────────────────────────────
# Principle of least privilege: only open what the demo actually needs.
# For a basic EC2 demo we open no inbound ports by default — the instance
# is reachable for cost/status verification purposes only.
# If SSH access is needed, it must be added intentionally by the user.
resource "aws_security_group" "ec2" {
  name        = "cloudprovision-sg-${var.job_id}"
  description = "CloudProvision managed security group for job ${var.job_id}"
  vpc_id      = data.aws_vpc.default.id

  # No inbound rules — instance is not publicly accessible by default.
  # Add rules here when specific access is required (e.g. SSH on port 22
  # scoped to a known CIDR, not 0.0.0.0/0).

  egress {
    description = "Allow all outbound traffic (required for yum/package updates)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "cloudprovision-sg-${var.job_id}"
  }
}

# ── EC2 instance ───────────────────────────────────────────────────────────────
resource "aws_instance" "ec2" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = var.instance_type
  vpc_security_group_ids = [aws_security_group.ec2.id]

  # Associate a public IP so the instance ID / public IP appear in outputs.
  # The security group above has no inbound rules, so the instance is not
  # reachable externally despite having a public IP.
  associate_public_ip_address = true

  # Root volume: gp3 is the current-generation cost-effective option.
  root_block_device {
    volume_type           = "gp3"
    volume_size           = 8
    delete_on_termination = true
    encrypted             = true
  }

  # Disable termination protection — CloudProvision manages the lifecycle.
  disable_api_termination = false

  tags = {
    Name = var.instance_name
  }

  # Lifecycle: prevent accidental replacement when tags change.
  lifecycle {
    ignore_changes = [tags]
  }
}
