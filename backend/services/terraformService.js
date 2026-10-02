'use strict';

/**
 * Terraform Service
 *
 * Provides safe, structured execution of Terraform CLI commands via
 * child_process.spawn. Never constructs shell commands by string
 * concatenation from user input — all arguments are passed as a
 * discrete array so no shell injection is possible.
 *
 * Supported operations:
 *   fmt       — terraform fmt -check -recursive
 *   init      — terraform init -no-color
 *   validate  — terraform validate -no-color
 *   plan      — terraform plan -no-color -var-file=terraform.tfvars
 *   apply     — terraform apply -auto-approve -no-color -var-file=terraform.tfvars
 *   output    — terraform output -json
 *   destroy   — terraform destroy -auto-approve -no-color -var-file=terraform.tfvars
 *
 * Each function returns a Promise<TerraformResult>:
 *   { success: boolean, stdout: string, stderr: string, exitCode: number }
 */

const { spawn }  = require('child_process');
const path       = require('path');
const fs         = require('fs');
const logger     = require('../utils/logger');

// Default timeout per Terraform operation (ms).
// apply/destroy may take several minutes for real AWS resources.
const TIMEOUTS = {
  fmt:      30_000,
  init:     120_000,
  validate:  30_000,
  plan:     120_000,
  apply:    600_000,  // 10 minutes
  output:    30_000,
  destroy:  600_000,  // 10 minutes
};

/**
 * Resolves the Terraform binary path.
 * Uses TERRAFORM_BIN env var if set, otherwise falls back to 'terraform'
 * (assumes it is on PATH).
 *
 * @returns {string}
 */
function getTerraformBin() {
  return process.env.TERRAFORM_BIN || 'terraform';
}

/**
 * Spawns a Terraform subprocess and resolves with its result.
 *
 * @param {object} params
 * @param {string}   params.workDir    - Absolute path to the working directory.
 * @param {string[]} params.args       - Argument array. Never built from raw user input.
 * @param {number}   [params.timeoutMs]- Milliseconds before the process is killed.
 * @param {object}   [params.env]      - Additional environment variables.
 * @param {Function} [params.onLog]    - Optional callback(line) for streaming log lines.
 * @returns {Promise<{success:boolean, stdout:string, stderr:string, exitCode:number}>}
 */
function runTerraform({ workDir, args, timeoutMs = 120_000, env = {}, onLog }) {
  return new Promise((resolve) => {
    const bin = getTerraformBin();

    // Validate workDir exists before spawning
    if (!fs.existsSync(workDir)) {
      const msg = `Terraform workDir does not exist: ${workDir}`;
      logger.error(msg);
      return resolve({ success: false, stdout: '', stderr: msg, exitCode: -1 });
    }

    logger.debug(`Terraform spawn: ${bin} ${args.join(' ')} (cwd=${workDir})`);

    const proc = spawn(bin, args, {
      cwd:   workDir,
      shell: false,           // never use shell — prevents injection
      env:   {
        ...process.env,       // inherit AWS credential chain env vars
        ...env,
        TF_IN_AUTOMATION: '1',  // suppresses interactive prompts
      },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (onLog) {
        text.split('\n').filter(Boolean).forEach(line => onLog(line));
      }
    });

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (onLog) {
        text.split('\n').filter(Boolean).forEach(line => onLog(`[stderr] ${line}`));
      }
    });

    // Kill the process if it exceeds the timeout
    const timer = setTimeout(() => {
      logger.error(`Terraform timed out after ${timeoutMs}ms: ${args[0]}`);
      proc.kill('SIGTERM');
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      const exitCode = code ?? -1;
      const success  = exitCode === 0;

      logger.debug(`Terraform ${args[0]} exited with code ${exitCode}`);
      if (!success) {
        logger.warn(`Terraform ${args[0]} failed (exit ${exitCode}):\n${stderr.slice(0, 500)}`);
      }

      resolve({ success, stdout, stderr, exitCode });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      logger.error(`Terraform spawn error: ${err.message}`);
      resolve({
        success:  false,
        stdout,
        stderr:   stderr + '\n' + err.message,
        exitCode: -1,
      });
    });
  });
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * terraform fmt -check -recursive
 * Checks formatting without modifying files.
 * Returns success=false if any file is not canonical format.
 */
function fmt(workDir, { onLog } = {}) {
  return runTerraform({
    workDir,
    args:      ['fmt', '-check', '-recursive', '-no-color'],
    timeoutMs: TIMEOUTS.fmt,
    onLog,
  });
}

/**
 * terraform init -no-color -input=false
 * Downloads providers into the job's working directory.
 */
function init(workDir, { onLog } = {}) {
  return runTerraform({
    workDir,
    args:      ['init', '-no-color', '-input=false'],
    timeoutMs: TIMEOUTS.init,
    onLog,
  });
}

/**
 * terraform validate -no-color
 * Validates configuration syntax without making AWS calls.
 */
function validate(workDir, { onLog } = {}) {
  return runTerraform({
    workDir,
    args:      ['validate', '-no-color'],
    timeoutMs: TIMEOUTS.validate,
    onLog,
  });
}

/**
 * terraform plan -no-color -input=false -var-file=terraform.tfvars
 * Dry-run. Does not create resources.
 */
function plan(workDir, { onLog } = {}) {
  return runTerraform({
    workDir,
    args:      ['plan', '-no-color', '-input=false', '-var-file=terraform.tfvars'],
    timeoutMs: TIMEOUTS.plan,
    onLog,
  });
}

/**
 * terraform apply -auto-approve -no-color -input=false -var-file=terraform.tfvars
 * Creates real AWS resources. Only called after explicit user request through
 * the CloudProvision API — never on startup or automatically.
 */
function apply(workDir, { onLog } = {}) {
  return runTerraform({
    workDir,
    args:      ['apply', '-auto-approve', '-no-color', '-input=false', '-var-file=terraform.tfvars'],
    timeoutMs: TIMEOUTS.apply,
    onLog,
  });
}

/**
 * terraform output -json
 * Parses and returns Terraform outputs as a JS object.
 * Returns null if output command fails or produces no output.
 *
 * @returns {Promise<object|null>}
 */
async function getOutput(workDir) {
  const result = await runTerraform({
    workDir,
    args:      ['output', '-json'],
    timeoutMs: TIMEOUTS.output,
  });

  if (!result.success || !result.stdout.trim()) {
    logger.warn(`terraform output failed or empty in ${workDir}`);
    return null;
  }

  try {
    return JSON.parse(result.stdout);
  } catch (err) {
    logger.error(`Failed to parse terraform output JSON: ${err.message}`);
    return null;
  }
}

/**
 * terraform destroy -auto-approve -no-color -input=false -var-file=terraform.tfvars
 * Destroys all resources in the job's Terraform state.
 * Only called when a user explicitly requests destruction through the API.
 */
function destroy(workDir, { onLog } = {}) {
  return runTerraform({
    workDir,
    args:      ['destroy', '-auto-approve', '-no-color', '-input=false', '-var-file=terraform.tfvars'],
    timeoutMs: TIMEOUTS.destroy,
    onLog,
  });
}

/**
 * Flattens terraform output -json into a plain key→value object.
 * e.g. { instance_id: { value: "i-abc", type: "string" } }
 *      → { instance_id: "i-abc" }
 *
 * @param {object} rawOutput  - Parsed JSON from `terraform output -json`
 * @returns {object}
 */
function flattenOutputs(rawOutput) {
  if (!rawOutput || typeof rawOutput !== 'object') return {};
  const flat = {};
  for (const [key, obj] of Object.entries(rawOutput)) {
    flat[key] = obj?.value ?? null;
  }
  return flat;
}

module.exports = {
  fmt,
  init,
  validate,
  plan,
  apply,
  getOutput,
  destroy,
  flattenOutputs,
  // Exported for testing — allows tests to verify args without real subprocess
  _runTerraform: runTerraform,
};
