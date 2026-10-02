'use strict';

/**
 * Input sanitization helpers.
 *
 * These are used to validate and allowlist values before they are ever
 * passed to Terraform or any shell subprocess. They are NOT a substitute
 * for express-validator on the API layer — both layers validate.
 */

// AWS regions that CloudProvision supports
const ALLOWED_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-west-2',
  'eu-central-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
];

// EC2 instance types allowed for provisioning
const ALLOWED_EC2_INSTANCE_TYPES = [
  't2.micro',
  't2.small',
  't2.medium',
  't3.micro',
  't3.small',
  't3.medium',
];

// RDS instance classes allowed for provisioning
const ALLOWED_RDS_INSTANCE_CLASSES = [
  'db.t3.micro',
  'db.t3.small',
];

// RDS engines allowed
const ALLOWED_RDS_ENGINES = [
  'mysql',
  'postgres',
];

/**
 * Returns true if the value is a non-empty string with only alphanumeric,
 * hyphens, and underscores — safe for use as a Terraform variable value.
 */
function isSafeIdentifier(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value) && value.length > 0;
}

/**
 * Returns true if the region is in the allowlist.
 */
function isAllowedRegion(region) {
  return ALLOWED_REGIONS.includes(region);
}

/**
 * Returns true if the EC2 instance type is in the allowlist.
 */
function isAllowedEc2InstanceType(instanceType) {
  return ALLOWED_EC2_INSTANCE_TYPES.includes(instanceType);
}

/**
 * Returns true if the RDS instance class is in the allowlist.
 */
function isAllowedRdsInstanceClass(instanceClass) {
  return ALLOWED_RDS_INSTANCE_CLASSES.includes(instanceClass);
}

/**
 * Returns true if the RDS engine is in the allowlist.
 */
function isAllowedRdsEngine(engine) {
  return ALLOWED_RDS_ENGINES.includes(engine);
}

/**
 * Validates an S3 bucket label (user-supplied prefix).
 * AWS bucket names: 3–63 chars, lowercase letters, numbers, hyphens only,
 * must start/end with letter or number.
 */
function isValidS3BucketLabel(label) {
  if (typeof label !== 'string') return false;
  if (label.length < 3 || label.length > 36) return false; // leave room for suffix
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(label);
}

module.exports = {
  ALLOWED_REGIONS,
  ALLOWED_EC2_INSTANCE_TYPES,
  ALLOWED_RDS_INSTANCE_CLASSES,
  ALLOWED_RDS_ENGINES,
  isSafeIdentifier,
  isAllowedRegion,
  isAllowedEc2InstanceType,
  isAllowedRdsInstanceClass,
  isAllowedRdsEngine,
  isValidS3BucketLabel,
};
