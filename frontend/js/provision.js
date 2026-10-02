/**
 * CloudProvision — Provisioning UI
 * Handles resource type selection, form rendering, job submission, polling.
 */
'use strict';

const POLL_INTERVAL_MS = 3000;
const activePollers = {};

function startPolling(jobId, onUpdate) {
  if (activePollers[jobId]) return;
  const terminal = new Set(['READY', 'FAILED', 'DESTROYED']);
  activePollers[jobId] = setInterval(async () => {
    try {
      const data = await api.get(`/status/${jobId}`);
      if (data) {
        onUpdate(data);
        if (terminal.has(data.status)) stopPolling(jobId);
      }
    } catch (err) {
      console.error(`Polling error for ${jobId}:`, err.message);
    }
  }, POLL_INTERVAL_MS);
}

function stopPolling(jobId) {
  if (activePollers[jobId]) {
    clearInterval(activePollers[jobId]);
    delete activePollers[jobId];
  }
}

// ── EC2 form ──────────────────────────────────────────────────────────────────

const EC2_INSTANCE_TYPES = ['t2.micro','t2.small','t2.medium','t3.micro','t3.small','t3.medium'];
const REGIONS = [
  'us-east-1','us-east-2','us-west-1','us-west-2',
  'eu-west-1','eu-west-2','eu-central-1',
  'ap-southeast-1','ap-southeast-2','ap-northeast-1',
];

function renderEC2Form() {
  return `
    <div class="provision-form" id="pf">
      <div class="form-group">
        <label class="form-label">Instance Name</label>
        <input class="form-input" id="pf-name" type="text" placeholder="my-server" maxlength="64" />
      </div>
      <div class="form-group">
        <label class="form-label">Instance Type</label>
        <select class="form-select" id="pf-itype">
          ${EC2_INSTANCE_TYPES.map(t => `<option value="${t}"${t==='t3.micro'?' selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Region</label>
        <select class="form-select" id="pf-region">
          ${REGIONS.map(r => `<option value="${r}"${r==='us-east-1'?' selected':''}>${r}</option>`).join('')}
        </select>
      </div>
      <div id="pf-alert" class="alert mt-4"></div>
      <button class="btn btn-primary btn-full mt-4" id="pf-submit" type="button">
        🚀 Provision EC2 Instance
      </button>
    </div>`;
}

function renderS3Form() {
  return `
    <div class="provision-form" id="pf">
      <div class="form-group">
        <label class="form-label">Bucket Name Prefix <span class="text-muted text-xs">(optional — auto-generated if blank)</span></label>
        <input class="form-input" id="pf-bucket" type="text" placeholder="my-bucket" maxlength="36"
          pattern="[a-z0-9][a-z0-9\\-]*[a-z0-9]" />
        <span class="form-error" id="pf-bucket-error">Must be lowercase letters, numbers, and hyphens only.</span>
      </div>
      <div class="form-group">
        <label class="form-label">Region</label>
        <select class="form-select" id="pf-region">
          ${REGIONS.map(r => `<option value="${r}"${r==='us-east-1'?' selected':''}>${r}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" id="pf-versioning" style="width:16px;height:16px;" />
          Enable Versioning
        </label>
      </div>
      <div id="pf-alert" class="alert mt-4"></div>
      <button class="btn btn-primary btn-full mt-4" id="pf-submit" type="button">
        🪣 Create S3 Bucket
      </button>
    </div>`;
}

function renderRDSForm() {
  return `
    <div class="provision-form" id="pf">
      <div class="form-group">
        <label class="form-label">Database Engine</label>
        <select class="form-select" id="pf-engine">
          <option value="mysql">MySQL 8.0</option>
          <option value="postgres">PostgreSQL 15</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Instance Class</label>
        <select class="form-select" id="pf-class">
          <option value="db.t3.micro" selected>db.t3.micro (free tier eligible)</option>
          <option value="db.t3.small">db.t3.small</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Database Name</label>
        <input class="form-input" id="pf-dbname" type="text" value="appdb" maxlength="64" />
      </div>
      <div class="form-group">
        <label class="form-label">Master Username</label>
        <input class="form-input" id="pf-dbuser" type="text" value="cpuser" maxlength="16" />
      </div>
      <div class="form-group">
        <label class="form-label">Storage (GB)</label>
        <input class="form-input" id="pf-storage" type="number" value="20" min="20" max="100" />
      </div>
      <div class="form-group">
        <label class="form-label">Region</label>
        <select class="form-select" id="pf-region">
          ${REGIONS.map(r => `<option value="${r}"${r==='us-east-1'?' selected':''}>${r}</option>`).join('')}
        </select>
      </div>
      <div class="alert alert-warning visible mt-2" style="font-size:0.8rem;">
        ⚠️ RDS incurs AWS charges (~$0.017/hr for db.t3.micro). Destroy when done.
      </div>
      <div id="pf-alert" class="alert mt-4"></div>
      <button class="btn btn-primary btn-full mt-4" id="pf-submit" type="button">
        🗄️ Create RDS Database
      </button>
    </div>`;
}

function getFormConfig(resourceType) {
  switch (resourceType) {
    case 'ec2': return {
      resourceType: 'ec2',
      config: {
        instanceName: document.getElementById('pf-name')?.value.trim() || 'cloudprovision-ec2',
        instanceType: document.getElementById('pf-itype')?.value || 't3.micro',
        region:       document.getElementById('pf-region')?.value || 'us-east-1',
      },
    };
    case 's3': return {
      resourceType: 's3',
      config: {
        bucketName:        document.getElementById('pf-bucket')?.value.trim().toLowerCase() || undefined,
        region:            document.getElementById('pf-region')?.value || 'us-east-1',
        versioningEnabled: document.getElementById('pf-versioning')?.checked || false,
      },
    };
    case 'rds': return {
      resourceType: 'rds',
      config: {
        dbEngine:        document.getElementById('pf-engine')?.value || 'mysql',
        dbInstanceClass: document.getElementById('pf-class')?.value  || 'db.t3.micro',
        dbName:          document.getElementById('pf-dbname')?.value.trim() || 'appdb',
        dbUsername:      document.getElementById('pf-dbuser')?.value.trim() || 'cpuser',
        dbStorage:       parseInt(document.getElementById('pf-storage')?.value, 10) || 20,
        region:          document.getElementById('pf-region')?.value || 'us-east-1',
      },
    };
    default: return null;
  }
}

// ── Job status card ────────────────────────────────────────────────────────────

function renderJobStatusCard(job, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const outputs = job.resource?.outputs || {};

  let outputsHtml = '';
  if (job.status === 'READY' && Object.keys(outputs).length > 0) {
    const rows = Object.entries(outputs)
      .filter(([k]) => !['job_id','user_id'].includes(k))
      .map(([k, v]) => `<tr><td class="text-muted text-sm">${k.replace(/_/g,' ')}</td><td class="text-mono text-sm">${v || '—'}</td></tr>`).join('');
    outputsHtml = `
      <div class="mt-4">
        <div class="text-sm font-medium mb-2">Outputs</div>
        <table class="table"><tbody>${rows}</tbody></table>
      </div>`;
  }

  let errorHtml = '';
  if (job.status === 'FAILED' && job.errorMessage) {
    errorHtml = `<div class="alert alert-error visible mt-4" style="font-size:0.8rem;word-break:break-all;">${escHtml(job.errorMessage.slice(0, 400))}</div>`;
  }

  container.innerHTML = `
    <div class="card mt-6">
      <div class="card-header">
        <div>
          <span class="font-medium">${resourceTypeIcon(job.resourceType)} ${resourceTypeLabel(job.resourceType)} Job</span>
          <span class="text-muted text-xs ml-2">${job.jobId?.slice(0,8)}…</span>
        </div>
        ${renderBadge(job.status)}
      </div>
      ${job.status === 'PROVISIONING' || job.status === 'DESTROYING' || job.status === 'PENDING' ? `
        <div class="flex items-center gap-3 text-muted text-sm mt-2">
          <span class="spinner"></span>
          ${job.status === 'PENDING' ? 'Queued…' : job.status === 'PROVISIONING' ? 'Terraform is running. This may take a few minutes…' : 'Destroying resource…'}
        </div>` : ''}
      ${outputsHtml}
      ${errorHtml}
    </div>`;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Wire provision form on dashboard ──────────────────────────────────────────

function initProvisionUI(onJobCreated) {
  const selector = document.getElementById('resource-type-selector');
  const formContainer = document.getElementById('provision-form-container');
  if (!selector || !formContainer) return;

  let selectedType = null;

  selector.querySelectorAll('.resource-type-card').forEach(card => {
    card.addEventListener('click', () => {
      selector.querySelectorAll('.resource-type-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedType = card.dataset.type;

      const formHtml = {
        ec2: renderEC2Form(),
        s3:  renderS3Form(),
        rds: renderRDSForm(),
      }[selectedType] || '';
      formContainer.innerHTML = formHtml;
      formContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      document.getElementById('pf-submit')?.addEventListener('click', async () => {
        const btn = document.getElementById('pf-submit');
        const alertEl = document.getElementById('pf-alert');
        if (alertEl) alertEl.className = 'alert mt-4';

        const payload = getFormConfig(selectedType);
        if (!payload) return;

        setButtonLoading(btn, 'Submitting…');
        try {
          const result = await api.post('/provision', payload);
          setButtonReady(btn);
          formContainer.innerHTML = '';
          selector.querySelectorAll('.resource-type-card').forEach(c => c.classList.remove('selected'));
          if (onJobCreated) onJobCreated(result);
        } catch (err) {
          setButtonReady(btn);
          if (alertEl) {
            alertEl.textContent = err.message || 'Provisioning request failed.';
            alertEl.className = 'alert alert-error visible mt-4';
          }
        }
      });
    });
  });
}
