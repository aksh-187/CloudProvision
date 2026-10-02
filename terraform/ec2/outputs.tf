# ─── EC2 Module — Outputs ──────────────────────────────────────────────────────
# Captured by the provisioning service via `terraform output -json` and stored
# in the resources table. Displayed on the dashboard.
# Never include sensitive values (private keys, passwords) here.

output "instance_id" {
  description = "The AWS EC2 instance ID (e.g. i-0abc1234567890def)."
  value       = aws_instance.ec2.id
}

output "public_ip" {
  description = "The public IPv4 address assigned to the instance."
  value       = aws_instance.ec2.public_ip
}

output "public_dns" {
  description = "The public DNS name assigned to the instance."
  value       = aws_instance.ec2.public_dns
}

output "private_ip" {
  description = "The private IPv4 address of the instance."
  value       = aws_instance.ec2.private_ip
}

output "instance_type" {
  description = "The instance type that was provisioned."
  value       = aws_instance.ec2.instance_type
}

output "ami_id" {
  description = "The AMI ID used for this instance."
  value       = aws_instance.ec2.ami
}

output "region" {
  description = "The AWS region where the instance was created."
  value       = var.aws_region
}

output "availability_zone" {
  description = "The availability zone of the instance."
  value       = aws_instance.ec2.availability_zone
}

output "security_group_id" {
  description = "The ID of the security group attached to the instance."
  value       = aws_security_group.ec2.id
}

output "instance_name" {
  description = "The Name tag applied to the instance."
  value       = var.instance_name
}

output "job_id" {
  description = "The CloudProvision job ID associated with this resource."
  value       = var.job_id
}
