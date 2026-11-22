const $ = (selector) => document.querySelector(selector);

const apiBaseInput = $('#apiBase');
const schemaSelect = $('#schema');
const fixtureSelect = $('#fixtureSelect');
const textArea = $('#text');
const resultEl = $('#result');
const errorEl = $('#error');
const badgesEl = $('#badges');
const submitBtn = $('#submit');
const clearBtn = $('#clear');
const copyBtn = $('#copyResult');

let mode = 'single';
let fixtures = [];
let lastResponseText = null;

const base = () => apiBaseInput.value.trim().replace(/\/+$/, '');

function showError(message) {
  errorEl.hidden = false;
  errorEl.textContent = message;
}

function clearOutput() {
  errorEl.hidden = true;
  badgesEl.innerHTML = '';
  resultEl.innerHTML = '<code>// result will appear here</code>';
  lastResponseText = null;
  copyBtn.disabled = true;
  copyBtn.classList.remove('copied');
  copyBtn.title = 'Copy JSON';
  copyBtn.setAttribute('aria-label', 'Copy JSON');
}

async function loadFixtures() {
  try {
    const response = await fetch(`${base()}/v1/schemas/fixtures`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    fixtures = body.fixtures || [];
    fixtureSelect.innerHTML = '<option value="">— choose a sample —</option>';
    fixtures.forEach((fixture, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${fixture.schema} · ${fixture.name}`;
      fixtureSelect.appendChild(option);
    });
  } catch {
    fixtureSelect.innerHTML = '<option value="">could not load samples</option>';
  }
}

function renderBadges(meta) {
  if (!meta) return;
  const badge = (label, kind = '') => `<span class="badge ${kind}">${label}</span>`;
  const cacheLabel = meta.stale ? 'STALE' : meta.cached ? 'CACHE HIT' : 'MODEL CALL';
  const cacheKind = meta.stale ? 'warn' : meta.cached ? 'hit' : 'miss';
  badgesEl.innerHTML = [
    badge(cacheLabel, cacheKind),
    badge(meta.model || '—'),
    badge(`${meta.latencyMs ?? 0} ms`),
    badge(`prompt ${meta.tokens?.prompt ?? 0} / completion ${meta.tokens?.completion ?? 0}`),
    badge(`repairs ${meta.repairAttempts ?? 0}`),
  ].join('');
}

async function submit() {
  clearOutput();
  submitBtn.disabled = true;
  submitBtn.textContent = 'Working…';

  try {
    const schema = schemaSelect.value;
    let endpoint;
    let payload;

    if (mode === 'single') {
      endpoint = `${base()}/v1/extractions`;
      payload = { schema, text: textArea.value };
    } else {
      const documents = textArea.value
        .split(/^\s*---\s*$/m)
        .map((text) => text.trim())
        .filter(Boolean)
        .slice(0, 5);
      if (documents.length === 0) throw new Error('Add at least one document.');
      if (documents.length > 5) throw new Error('Batch mode allows at most 5 documents.');
      endpoint = `${base()}/v1/extractions/batch`;
      payload = { schema, items: documents.map((text, index) => ({ clientId: `doc-${index + 1}`, text })) };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const body = await response.json();
    if (!response.ok) {
      const detail = body?.error?.details?.length
        ? `\n${JSON.stringify(body.error.details, null, 2)}`
        : '';
      throw new Error(`${body?.error?.code || 'HTTP ERROR'}: ${body?.error?.message || response.status}${detail}`);
    }

    lastResponseText = JSON.stringify(body, null, 2);
    resultEl.innerHTML = `<code>${escapeHtml(lastResponseText)}</code>`;
    copyBtn.disabled = false;
    renderBadges(body.meta);
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Extract JSON <span aria-hidden="true">→</span>';
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

async function copyResponse() {
  if (!lastResponseText) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(lastResponseText);
    } else {
      // Fallback for non-secure contexts (e.g. http://localhost)
      const area = document.createElement('textarea');
      area.value = lastResponseText;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    copyBtn.title = 'Copied!';
    copyBtn.setAttribute('aria-label', 'Copied!');
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.title = 'Copy JSON';
      copyBtn.setAttribute('aria-label', 'Copy JSON');
      copyBtn.classList.remove('copied');
    }, 1500);
  } catch (error) {
    showError(`Could not copy: ${error instanceof Error ? error.message : String(error)}`);
  }
}

copyBtn.addEventListener('click', copyResponse);

document.querySelectorAll('.mode').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.mode').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    mode = button.dataset.mode;
    $('#textLabel').textContent = mode === 'single' ? 'Text to extract' : 'Documents (separate with ---)';
    $('#hint').textContent = mode === 'single'
      ? 'In batch mode, separate up to 5 documents with a line containing only ---'
      : 'Up to 5 documents. Each one is extracted by a single model call for the whole batch.';
    clearOutput();
  });
});

fixtureSelect.addEventListener('change', () => {
  const fixture = fixtures[Number(fixtureSelect.value)];
  if (!fixture) return;
  schemaSelect.value = fixture.schema;
  textArea.value = fixture.text;
  clearOutput();
});

apiBaseInput.addEventListener('change', loadFixtures);
submitBtn.addEventListener('click', submit);
clearBtn.addEventListener('click', () => {
  textArea.value = '';
  fixtureSelect.value = '';
  clearOutput();
});

loadFixtures();
