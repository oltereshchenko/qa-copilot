const RECENT_KEYS_STORAGE = 'qa-copilot-recent-jira-keys';
const THEME_STORAGE = 'qa-copilot-theme';
const HISTORY_STORAGE = 'qa-copilot-history';
const SETTINGS_STORAGE = 'qa-copilot-settings';
const FAVORITES_STORAGE = 'qa-copilot-favorites';
const DRAFTS_STORAGE = 'qa-copilot-drafts';
const MAX_RECENT_KEYS = 5;
const MAX_HISTORY = 20;
let _uploadedFiles = [];
let _jiraBaseUrl = '';

document.addEventListener('DOMContentLoaded', () => {
  fetch('/api/config/status').then(r => r.json()).then(d => {
    _jiraBaseUrl = (d.jiraUrl || '').replace(/\/+$/, '');
  }).catch(() => {});
  initTheme();
  initTabs();
  initFeature('analyze', '/api/analyze', 'story');
  initFeature('testcases', '/api/testcases', 'story');
  initFeature('bugreport', '/api/bugreport', 'description');
  initJiraFetch();
  initRecentKeys();
  initQuickJira();
  initInsertTemplate();
  initHistory();
  initFavorites();
  initBulkAnalyze();
  initAnalyzeGenTC();
  initDailySummary();
  initSettings();
  initModelSelector();
  initDropZone();
  initFullscreen();
  initChat();
  initNotifications();
  initDraftPersistence();
});

const _draftFields = ['analyze-input', 'testcases-input', 'bugreport-input', 'chat-input'];

function initDraftPersistence() {
  const saved = JSON.parse(localStorage.getItem(DRAFTS_STORAGE) || '{}');
  _draftFields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (saved[id]) el.value = saved[id];
    el.addEventListener('input', _saveDrafts);
  });
  window.addEventListener('beforeunload', _saveDrafts);
}

function _saveDrafts() {
  const drafts = {};
  _draftFields.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value.trim()) drafts[id] = el.value;
  });
  localStorage.setItem(DRAFTS_STORAGE, JSON.stringify(drafts));
}

function _clearDraft(fieldId) {
  const drafts = JSON.parse(localStorage.getItem(DRAFTS_STORAGE) || '{}');
  delete drafts[fieldId];
  localStorage.setItem(DRAFTS_STORAGE, JSON.stringify(drafts));
}

let _activeModalClose = null;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && _activeModalClose) {
    _activeModalClose();
    _activeModalClose = null;
  }
});

function initTheme() {
  const saved = localStorage.getItem(THEME_STORAGE);
  if (saved) document.documentElement.setAttribute('data-theme', saved);

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    if (next === 'dark') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', next);
    }
    localStorage.setItem(THEME_STORAGE, next);
  });
}

function initTabs() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      switchTab(item.dataset.tab);
    });
  });

  const brand = document.getElementById('sidebar-brand');
  if (brand) {
    brand.addEventListener('click', () => switchTab('dashboard'));
    brand.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        switchTab('dashboard');
      }
    });
  }

  window.addEventListener('popstate', (e) => {
    const tab = (e.state && e.state.tab) ? e.state.tab : getTabFromPath();
    switchTab(tab, false);
  });

  const initialTab = getTabFromPath();
  switchTab(initialTab, false);
  history.replaceState({ tab: initialTab }, '', TAB_ROUTES[initialTab] || '/dashboard');
}

const TAB_ROUTES = {
  dashboard:  '/dashboard',
  analyze:    '/analyze',
  testcases:  '/test-cases',
  bugreport:  '/bug-report',
  daily:      '/daily-summary',
  settings:   '/settings',
};
const ROUTE_TO_TAB = Object.fromEntries(
  Object.entries(TAB_ROUTES).map(([tab, path]) => [path, tab])
);

function switchTab(tabName, pushState = true) {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  const target = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
  if (target) target.classList.add('active');
  const tabEl = document.getElementById(`tab-${tabName}`);
  if (tabEl) tabEl.classList.add('active');
  if (tabName === 'dashboard') refreshDashboard();

  const main = document.querySelector('.main');
  if (main) main.scrollTo(0, 0);

  if (pushState) {
    const path = TAB_ROUTES[tabName] || '/dashboard';
    if (window.location.pathname !== path) {
      history.pushState({ tab: tabName }, '', path);
    }
  }
  document.title = _tabTitle(tabName);
}

function _tabTitle(tabName) {
  const titles = {
    dashboard: 'Dashboard — QA Copilot',
    analyze: 'Analyze Story — QA Copilot',
    testcases: 'Test Cases — QA Copilot',
    bugreport: 'Bug Report — QA Copilot',
    daily: 'Daily Summary — QA Copilot',
    settings: 'Settings — QA Copilot',
  };
  return titles[tabName] || 'QA Copilot';
}

function getTabFromPath() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return 'dashboard';
  return ROUTE_TO_TAB[path] || 'dashboard';
}

function switchToTestCasesWithInput(inputText, jiraKey) {
  switchTab('testcases');
  const textarea = document.getElementById('testcases-input');
  textarea.value = inputText;

  if (jiraKey) {
    const keyInput = document.getElementById('testcases-jira-key');
    if (keyInput) keyInput.value = jiraKey;
    saveRecentKey(jiraKey);

    const preview = document.getElementById('testcases-preview');
    const toggle = document.getElementById('testcases-toggle');
    if (preview) {
      preview.innerHTML = marked.parse(inputText);
      preview.hidden = false;
      textarea.classList.add('textarea-collapsed');
      if (toggle) {
        toggle.hidden = false;
        toggle.textContent = 'Edit raw text';
      }
    }
  }

  document.getElementById('testcases-btn').click();
}

function getSelectedModel() {
  const sel = document.getElementById('model-quick-select');
  return sel ? sel.value : 'gpt-4o';
}

function getAuthHeaders() {
  const s = getSettings();
  const h = {};
  if (s.openaiKey) h['X-OpenAI-Key'] = s.openaiKey;
  if (s.jiraUrl) h['X-Jira-Url'] = s.jiraUrl;
  if (s.jiraEmail) h['X-Jira-Email'] = s.jiraEmail;
  if (s.jiraToken) h['X-Jira-Token'] = s.jiraToken;
  if (s.qaseToken) h['X-Qase-Token'] = s.qaseToken;
  if (s.qaseProject) h['X-Qase-Project'] = s.qaseProject;
  return h;
}

const _origFetch = window.fetch;
window.fetch = function(url, opts = {}) {
  if (typeof url === 'string' && url.startsWith('/api/')) {
    const authHeaders = getAuthHeaders();
    opts.headers = { ...(opts.headers || {}), ...authHeaders };
  }
  return _origFetch.call(this, url, opts);
};

function initModelSelector() {
  const quickSel = document.getElementById('model-quick-select');
  const settingsSel = document.getElementById('settings-ai-model');
  const saved = getSettings().aiModel || 'gpt-4o';

  if (quickSel) quickSel.value = saved;
  if (settingsSel) settingsSel.value = saved;

  if (quickSel) {
    quickSel.addEventListener('change', () => {
      const s = getSettings();
      s.aiModel = quickSel.value;
      saveSettings(s);
      if (settingsSel) settingsSel.value = quickSel.value;
      showToast(`Model: ${quickSel.value}`, 'success');
    });
  }
}

function initFeature(name, endpoint, bodyKey) {
  const btn = document.getElementById(`${name}-btn`);
  const input = document.getElementById(`${name}-input`);
  const output = document.getElementById(`${name}-output`);

  btn.addEventListener('click', () => {
    const text = input.value.trim();
    if (!text) {
      shakeElement(input);
      return;
    }
    const jiraKeyInput = document.getElementById(`${name}-jira-key`);
    const jiraKey = jiraKeyInput ? jiraKeyInput.value.trim() : '';
    streamRequest(endpoint, { [bodyKey]: text }, btn, output, name === 'bugreport', name === 'testcases', text, jiraKey, name === 'analyze');
  });

  input.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      btn.click();
    }
  });
}

/* ── Improvement #4: Recent Jira keys ── */
function getRecentKeys() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEYS_STORAGE) || '[]');
  } catch { return []; }
}

function saveRecentKey(key) {
  if (!key) return;
  let keys = getRecentKeys().filter(k => k !== key);
  keys.unshift(key);
  keys = keys.slice(0, MAX_RECENT_KEYS);
  localStorage.setItem(RECENT_KEYS_STORAGE, JSON.stringify(keys));
  renderAllRecentKeys();
}

function renderAllRecentKeys() {
  document.querySelectorAll('.recent-keys').forEach(container => {
    renderRecentKeysFor(container);
  });
}

function renderRecentKeysFor(container) {
  const keys = getRecentKeys();
  if (!keys.length) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = keys.map(k =>
    `<button class="recent-key-btn" data-key="${escapeAttr(k)}">${k}</button>`
  ).join('');

  container.querySelectorAll('.recent-key-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const keyInput = container.closest('.jira-fetch-bar').querySelector('.jira-key-input');
      keyInput.value = btn.dataset.key;
      container.closest('.jira-fetch-bar').querySelector('.btn-fetch').click();
    });
  });
}

function initRecentKeys() {
  document.querySelectorAll('.recent-keys').forEach(container => {
    renderRecentKeysFor(container);
  });
}

function initQuickJira() {
  const btn = document.getElementById('quick-jira-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const textarea = document.getElementById('bugreport-input');
    const content = textarea ? textarea.value.trim() : '';
    showJiraCreateDialog('', btn, true, content);
  });
}

function initInsertTemplate() {
  const btn = document.getElementById('insert-template-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const textarea = document.getElementById('bugreport-input');
    textarea.value = BUG_TEMPLATE;
    textarea.focus();
    showToast('Template inserted', 'success');
  });
}

const BUG_TEMPLATE = `*High Level Data*

Environment: 
Integration: 
Accounting Firm + Company Name (incl URL): 
Invoice ID(s): 
Can this be reproduced on Prod?: 

*Describe the bug + expected behavior*



*To Reproduce*

1. 
2. 
3. 
4. 

*Actual result:*



*Expected result:*



*Screenshots/Fullstory link/Datadog/Sentry*

If applicable, add screenshots to help explain your problem.

*Additional context*

`;

/* ── Jira Fetch with loading state (#3) + save recent (#4) ── */
function initJiraFetch() {
  document.querySelectorAll('.btn-fetch').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetId = btn.dataset.target;
      const textarea = document.getElementById(targetId);
      const keyInput = btn.closest('.jira-fetch-bar').querySelector('.jira-key-input');
      const key = keyInput.value.trim();

      if (!key) {
        shakeElement(keyInput);
        return;
      }

      btn.disabled = true;
      const origHTML = btn.innerHTML;
      btn.innerHTML = '<i data-lucide="loader" class="btn-icon spin"></i> Fetching...';
      refreshIcons();

      textarea.value = '';
      textarea.classList.add('loading-skeleton');
      textarea.placeholder = `Loading ${key} from Jira...`;

      try {
        const res = await fetch(`/api/jira/fetch?key=${encodeURIComponent(key)}`);
        const data = await res.json();

        textarea.classList.remove('loading-skeleton');

        if (data.error) {
          showToast(`Jira error: ${data.error}`, 'error');
          textarea.placeholder = 'Failed to load. Try again or paste manually.';
        } else {
          textarea.value = data.text;
          saveRecentKey(key);

          const tabName = targetId.replace('-input', '');
          const preview = document.getElementById(`${tabName}-preview`);
          const toggle = document.getElementById(`${tabName}-toggle`);
          if (preview) {
            preview.innerHTML = marked.parse(data.text);
            preview.hidden = false;
            textarea.classList.add('textarea-collapsed');
            toggle.hidden = false;
            toggle.onclick = () => {
              const isHidden = textarea.classList.contains('textarea-collapsed');
              textarea.classList.toggle('textarea-collapsed');
              toggle.textContent = isHidden ? 'Hide raw text' : 'Edit raw text';
            };
          }
        }
      } catch (err) {
        textarea.classList.remove('loading-skeleton');
        showToast('Failed to connect to Jira. Check your .env settings.', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = origHTML;
        refreshIcons();
        textarea.placeholder = textarea.dataset.originalPlaceholder || '';
      }
    });

    const keyInput = btn.closest('.jira-fetch-bar').querySelector('.jira-key-input');
    keyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btn.click();
    });
  });

  document.querySelectorAll('.input-panel textarea').forEach(ta => {
    ta.dataset.originalPlaceholder = ta.placeholder;
  });
}

/* ── Improvement #1: Toast notifications ── */
function refreshIcons() {
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const iconName = type === 'error' ? 'circle-x' : type === 'success' ? 'circle-check' : 'info';

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon"><i data-lucide="${iconName}"></i></span>
    <span class="toast-msg">${_esc(message)}</span>
    <button class="toast-close"><i data-lucide="x" style="width:14px;height:14px"></i></button>
  `;

  document.body.appendChild(toast);
  refreshIcons();

  requestAnimationFrame(() => toast.classList.add('toast-visible'));

  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  });

  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

/* ── Stream request with better error handling (#1) ── */
async function streamRequest(endpoint, body, btn, outputEl, isBugReport = false, isTestCases = false, inputText = '', jiraKey = '', isAnalyze = false) {
  const btnText = btn.querySelector('.btn-text');
  const btnLoader = btn.querySelector('.btn-loader');

  btn.disabled = true;
  btnText.hidden = true;
  btnLoader.hidden = false;

  outputEl.innerHTML = '<div class="ai-progress"><div class="ai-progress-bar" id="ai-progress-bar"></div></div><div class="output-content streaming-cursor"></div>';
  const contentEl = outputEl.querySelector('.output-content');
  const progressBar = outputEl.querySelector('#ai-progress-bar');
  let fullText = '';
  let progressVal = 5;

  const progressInterval = setInterval(() => {
    if (progressVal < 90) {
      progressVal += Math.random() * 8;
      if (progressBar) progressBar.style.width = `${Math.min(progressVal, 90)}%`;
    }
  }, 400);

  body.model = getSelectedModel();

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      clearInterval(progressInterval);
      const pe = outputEl.querySelector('.ai-progress'); if (pe) pe.remove();
      let errMsg = 'Something went wrong.';
      try {
        const err = await res.json();
        errMsg = err.error || errMsg;
      } catch {}
      contentEl.classList.remove('streaming-cursor');
      contentEl.innerHTML = renderErrorCard(errMsg);
      showToast(errMsg, 'error');
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value, { stream: true });

      if (fullText.includes('**Error:**')) {
        contentEl.classList.remove('streaming-cursor');
        const errorMsg = fullText.split('**Error:**')[1].trim();
        contentEl.innerHTML = renderErrorCard(errorMsg);
        showToast('AI request failed', 'error');
        return;
      }

      contentEl.innerHTML = marked.parse(fullText);
    }

    clearInterval(progressInterval);
    if (progressBar) { progressBar.style.width = '100%'; setTimeout(() => { const p = outputEl.querySelector('.ai-progress'); if (p) p.remove(); }, 400); }

    contentEl.classList.remove('streaming-cursor');

    const actions = document.createElement('div');
    actions.className = 'output-actions';

    let actionsHtml = `
      <button class="btn-copy" data-text="${escapeAttr(fullText)}">
        <i data-lucide="clipboard" class="btn-icon"></i> Copy Markdown
      </button>
      <button class="btn-copy btn-copy-html" data-html="true">
        <i data-lucide="file-text" class="btn-icon"></i> Copy Formatted
      </button>
      <button class="btn-favorite" id="fav-result-btn" title="Save to favorites">
        <i data-lucide="star" class="btn-icon"></i> Favorite
      </button>
    `;

    if (isBugReport) {
      actionsHtml += `
        <button class="btn-jira-create" id="create-jira-btn">
          <i data-lucide="plus-circle" class="btn-icon"></i> Create in Jira
        </button>
        <span class="jira-create-result" id="jira-create-result" hidden></span>
      `;
    }

    if (isTestCases) {
      actionsHtml += `
        <button class="btn-qase-push" id="push-qase-btn">
          <i data-lucide="flask-conical" class="btn-icon"></i> Push to Qase
        </button>
        <span class="qase-push-result" id="qase-push-result" hidden></span>
      `;
    }

    if (isAnalyze) {
      actionsHtml += `
        <button class="btn-generate-tc" id="generate-tc-from-analyze">
          <i data-lucide="clipboard-check" class="btn-icon"></i> Generate Test Cases
        </button>
      `;
      if (jiraKey) {
        actionsHtml += `
          <button class="btn-jira-comment" id="post-jira-comment-btn">
            <i data-lucide="message-square" class="btn-icon"></i> Post as Jira Comment
          </button>
          <span class="jira-comment-result" id="jira-comment-result" hidden></span>
        `;
      }
    }

    actions.innerHTML = actionsHtml;
    outputEl.insertBefore(actions, contentEl);
    refreshIcons();

    actions.querySelectorAll('.btn-copy').forEach(copyBtn => {
      copyBtn.addEventListener('click', () => {
        if (copyBtn.dataset.html) {
          copyHtml(contentEl.innerHTML, copyBtn);
        } else {
          copyText(copyBtn.dataset.text, copyBtn);
        }
      });
    });

    if (isBugReport) {
      const createBtn = document.getElementById('create-jira-btn');
      createBtn.addEventListener('click', () => {
        showJiraCreateDialog(fullText, createBtn);
      });
    }

    if (isTestCases) {
      const pushBtn = document.getElementById('push-qase-btn');
      pushBtn.addEventListener('click', () => {
        const suiteName = buildSuiteName(inputText, jiraKey);
        showQasePushDialog(fullText, pushBtn, suiteName);
      });
    }

    if (isAnalyze) {
      document.getElementById('generate-tc-from-analyze').addEventListener('click', () => {
        switchToTestCasesWithInput(inputText, jiraKey);
      });
      if (jiraKey) {
        const commentBtn = document.getElementById('post-jira-comment-btn');
        commentBtn.addEventListener('click', () => {
          postJiraComment(jiraKey, fullText, commentBtn);
        });
      }
    }

    const tabName = isAnalyze ? 'Analyze' : isTestCases ? 'Test Cases' : isBugReport ? 'Bug Report' : 'Result';
    const historyLabel = jiraKey ? `${jiraKey} — ${tabName}` : `${tabName}`;
    saveHistory(historyLabel, tabName, fullText, inputText, jiraKey);

    const favBtn = document.getElementById('fav-result-btn');
    if (favBtn) {
      const alreadySaved = getFavorites().some(f => f.label === historyLabel && f.type === tabName);
      if (alreadySaved) {
        favBtn.classList.add('is-fav');
        favBtn.innerHTML = '<i data-lucide="star" class="btn-icon"></i> Saved';
      }
      favBtn.addEventListener('click', () => {
        const existing = getFavorites().find(f => f.label === historyLabel && f.type === tabName);
        if (existing) {
          let f = getFavorites().filter(x => x.id !== existing.id);
          localStorage.setItem(FAVORITES_STORAGE, JSON.stringify(f));
          renderFavorites();
          favBtn.classList.remove('is-fav');
          favBtn.innerHTML = '<i data-lucide="star" class="btn-icon"></i> Favorite';
          showToast('Removed from favorites', 'success');
        } else {
          addFavorite(historyLabel, tabName, fullText, inputText, jiraKey);
          favBtn.classList.add('is-fav');
          favBtn.innerHTML = '<i data-lucide="star" class="btn-icon"></i> Saved';
        }
        refreshIcons();
      });
    }

    showToast('Done! Results ready.', 'success');

  } catch (err) {
    clearInterval(progressInterval);
    const p = outputEl.querySelector('.ai-progress'); if (p) p.remove();
    contentEl.classList.remove('streaming-cursor');
    contentEl.innerHTML = renderErrorCard('Connection error. Make sure the server is running.');
    showToast('Connection error', 'error');
  } finally {
    btn.disabled = false;
    btnText.hidden = false;
    btnLoader.hidden = true;
  }
}

function postJiraComment(issueKey, markdown, btn) {
  const commentMatch = markdown.match(/##\s*💬\s*Ready-to-Paste Jira Comment\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  const commentBody = commentMatch ? commentMatch[1].trim() : markdown;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  overlay.innerHTML = `
    <div class="modal-box modal-box-wide">
      <h3>Post Comment to ${escapeAttr(issueKey)}</h3>
      <div class="modal-field">
        <label>Comment</label>
        <textarea id="jira-comment-text" class="modal-textarea" rows="12">${escapeAttr(commentBody)}</textarea>
      </div>
      <div class="modal-actions">
        <button class="btn-modal-cancel" id="comment-cancel">Cancel</button>
        <button class="btn-modal-confirm" id="comment-confirm">Post Comment</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  function closeModal() {
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 250);
  }

  document.getElementById('comment-cancel').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  _activeModalClose = closeModal;

  document.getElementById('comment-confirm').addEventListener('click', async () => {
    const confirmBtn = document.getElementById('comment-confirm');
    const body = document.getElementById('jira-comment-text').value.trim();

    if (!body) {
      showToast('Comment cannot be empty.', 'error');
      return;
    }

    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Posting...';

    try {
      const res = await fetch('/api/jira/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue_key: issueKey, body }),
      });

      const data = await res.json();
      closeModal();

      if (data.error) {
        showToast(`Jira error: ${data.error}`, 'error');
      } else {
        btn.innerHTML = '<i data-lucide="check" class="btn-icon"></i> Posted!';
        refreshIcons();
        const resultEl = document.getElementById('jira-comment-result');
        if (resultEl) {
          resultEl.innerHTML = `→ <a href="${data.url}" target="_blank">${data.issue_key}</a>`;
          resultEl.hidden = false;
        }
        showToast(`Comment posted to ${data.issue_key}`, 'success');
      }
    } catch (err) {
      closeModal();
      showToast('Failed to post comment. Check your connection.', 'error');
    }
  });
}

function renderErrorCard(message) {
  setTimeout(refreshIcons, 0);
  return `<div class="error-card">
    <div class="error-card-icon"><i data-lucide="triangle-alert" style="width:18px;height:18px;color:var(--red)"></i></div>
    <div class="error-card-body">
      <div class="error-card-title">Something went wrong</div>
      <div class="error-card-msg">${_esc(message)}</div>
    </div>
  </div>`;
}

async function showJiraCreateDialog(markdown, btn, isQuick = false, prefilled = '') {
  const settings = getSettings();

  let summary = '';
  if (!isQuick && markdown) {
    const titleMatch = markdown.match(/##\s*🐛\s*(.+)/);
    summary = titleMatch ? titleMatch[1].trim() : 'Bug report from QA Copilot';
  }

  let descriptionBody;
  if (isQuick && prefilled) {
    descriptionBody = prefilled;
  } else if (isQuick) {
    descriptionBody = buildBugDescription('');
  } else {
    descriptionBody = buildBugDescription(markdown);
  }

  let meta = { feature_teams: [], labels: [] };
  try {
    const metaRes = await fetch('/api/jira/meta');
    meta = await metaRes.json();
  } catch (e) { /* fallback to empty lists */ }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const defaultTeam = settings.defaultTeam || '';
  const defaultLabels = settings.defaultLabels || [];

  const ftOptions = (meta.feature_teams || []).map(ft => {
    const checked = ft.id === defaultTeam ? ' checked' : '';
    return `<label class="chip-option"><input type="checkbox" value="${ft.id}"${checked} /><span>${ft.value}</span></label>`;
  }).join('');

  const lblOptions = (meta.labels || []).map(l => {
    const checked = defaultLabels.includes(l) ? ' checked' : '';
    return `<label class="chip-option"><input type="checkbox" value="${escapeAttr(l)}"${checked} /><span>${l}</span></label>`;
  }).join('');

  const defaultSpace = settings.defaultSpace || 'ENG';
  const defaultType = settings.defaultType || 'Defect';
  const typeOptions = ['Defect', 'Bug', 'Task', 'Story'].map(t =>
    `<option value="${t}"${t === defaultType ? ' selected' : ''}>${t}</option>`
  ).join('');

  overlay.innerHTML = `
    <div class="modal-box modal-box-wide">
      <h3>Create Bug in Jira</h3>

      <div class="modal-row modal-row-3">
        <div class="modal-field">
          <label>Space *</label>
          <input type="text" id="jira-create-space" value="${escapeAttr(defaultSpace)}" />
        </div>
        <div class="modal-field">
          <label>Work Type *</label>
          <select id="jira-create-type">
            ${typeOptions}
          </select>
        </div>
        <div class="modal-field">
          <label>Status</label>
          <input type="text" id="jira-create-status" value="To Do" readonly class="field-readonly" />
        </div>
      </div>

      <div class="modal-field">
        <label>Summary *</label>
        <input type="text" id="jira-create-summary" value="${escapeAttr(summary)}" />
      </div>

      <div class="modal-field">
        <label>Description</label>
        <textarea id="jira-create-desc" class="modal-textarea" rows="14">${escapeAttr(descriptionBody)}</textarea>
      </div>

      <div class="modal-field">
        <label>Feature Teams</label>
        <div class="chip-group-wrap">
          <input type="text" class="chip-filter" id="jira-ft-filter" placeholder="Search teams..." />
          <div class="chip-group" id="jira-ft-group">${ftOptions}</div>
        </div>
      </div>

      <div class="modal-field">
        <label>Labels</label>
        <div class="chip-group-wrap">
          <input type="text" class="chip-filter" id="jira-lbl-filter" placeholder="Search labels..." />
          <div class="chip-group" id="jira-lbl-group">${lblOptions}</div>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn-modal-cancel" id="jira-create-cancel">Cancel</button>
        <button class="btn-modal-confirm" id="jira-create-confirm">Create in Jira</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  initChipFilter('jira-ft-filter', 'jira-ft-group');
  initChipFilter('jira-lbl-filter', 'jira-lbl-group');

  function closeModal() {
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 250);
  }

  document.getElementById('jira-create-cancel').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  _activeModalClose = closeModal;

  document.getElementById('jira-create-confirm').addEventListener('click', async () => {
    const confirmBtn = document.getElementById('jira-create-confirm');
    const space = document.getElementById('jira-create-space').value.trim();
    const issueType = document.getElementById('jira-create-type').value;
    const summaryVal = document.getElementById('jira-create-summary').value.trim();

    if (!space || !summaryVal) {
      showToast('Space and Summary are required.', 'error');
      return;
    }

    const descVal = document.getElementById('jira-create-desc').value.trim();
    const selectedTeams = [...document.querySelectorAll('#jira-ft-group input:checked')].map(cb => cb.value);
    const selectedLabels = [...document.querySelectorAll('#jira-lbl-group input:checked')].map(cb => cb.value);

    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Creating...';

    try {
      const res = await fetch('/api/jira/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: space,
          summary: summaryVal,
          description: descVal,
          issue_type: issueType,
          feature_teams: selectedTeams,
          labels: selectedLabels,
        }),
      });

      const data = await res.json();
      closeModal();

      if (data.error) {
        showToast(`Jira error: ${data.error}`, 'error');
      } else {
        if (getUploadedFileIds().length) {
          await uploadAndAttach(data.key);
        }
        if (!isQuick) {
          const resultEl = document.getElementById('jira-create-result');
          btn.innerHTML = '<i data-lucide="check" class="btn-icon"></i> Created!';
          refreshIcons();
          btn.disabled = true;
          if (resultEl) {
            resultEl.innerHTML = `→ <a href="${data.url}" target="_blank">${data.key}</a>`;
            resultEl.hidden = false;
          }
        }
        showToast(`Created <a href="${data.url}" target="_blank">${data.key}</a> in Jira`, 'success');
      }
    } catch (err) {
      closeModal();
      showToast('Failed to create Jira issue. Check your connection.', 'error');
    }
  });
}

function buildBugDescription(markdown) {
  if (!markdown) return BUG_TEMPLATE;

  const extractSection = (text, header) => {
    const patterns = [
      new RegExp(`\\*${header}\\*\\s*\\n([\\s\\S]*?)(?=\\n\\*[^*]+\\*|$)`, 'i'),
      new RegExp(`###?\\s*${header}\\s*\\n([\\s\\S]*?)(?=\\n###?\\s|\\n\\*[^*]+\\*|$)`, 'i'),
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m && m[1].trim()) return m[1].trim();
    }
    return '';
  };

  const extractField = (text, field) => {
    const re = new RegExp(`${field}\\s*:\\s*(.+)`, 'i');
    const m = text.match(re);
    return m ? m[1].trim() : '';
  };

  const environment = extractField(markdown, 'Environment');
  const integration = extractField(markdown, 'Integration');
  const firm = extractField(markdown, 'Accounting Firm \\+ Company Name \\(incl URL\\)');
  const invoiceIds = extractField(markdown, 'Invoice ID\\(s\\)');
  const canReprod = extractField(markdown, 'Can this be reproduced on Prod\\?');

  const bugDesc = extractSection(markdown, 'Describe the bug \\+ expected behavior')
    || extractSection(markdown, 'Description');
  const steps = extractSection(markdown, 'To Reproduce')
    || extractSection(markdown, 'Steps to Reproduce');
  const actual = extractSection(markdown, 'Actual result:?')
    || extractSection(markdown, 'Actual Result');
  const expected = extractSection(markdown, 'Expected result:?')
    || extractSection(markdown, 'Expected Result');
  const screenshots = extractSection(markdown, 'Screenshots/Fullstory link/Datadog/Sentry');
  const additional = extractSection(markdown, 'Additional context')
    || extractSection(markdown, 'Additional Information');

  const lines = [
    '*High Level Data*',
    '',
    `Environment: ${environment}`,
    `Integration: ${integration}`,
    `Accounting Firm + Company Name (incl URL): ${firm}`,
    `Invoice ID(s): ${invoiceIds}`,
    `Can this be reproduced on Prod?: ${canReprod}`,
    '',
    '*Describe the bug + expected behavior*',
    '',
    bugDesc,
    '',
    '*To Reproduce*',
    '',
    steps || '1. \n2. \n3. \n4. ',
    '',
    '*Actual result:*',
    '',
    actual,
    '',
    '*Expected result:*',
    '',
    expected,
    '',
    '*Screenshots/Fullstory link/Datadog/Sentry*',
    '',
    screenshots || 'If applicable, add screenshots to help explain your problem.',
    '',
    '*Additional context*',
    '',
    additional,
  ];

  return lines.join('\n');
}

function initChipFilter(filterId, groupId) {
  const filterInput = document.getElementById(filterId);
  const group = document.getElementById(groupId);
  if (!filterInput || !group) return;

  filterInput.addEventListener('input', () => {
    const query = filterInput.value.toLowerCase();
    group.querySelectorAll('.chip-option').forEach(chip => {
      const text = chip.querySelector('span').textContent.toLowerCase();
      chip.style.display = text.includes(query) ? '' : 'none';
    });
  });
}

function buildSuiteName(inputText, jiraKey) {
  let ticketKey = jiraKey || '';
  let title = '';

  const keyMatch = inputText.match(/^##\s*([A-Z][A-Z0-9]+-\d+):\s*(.+)/m);
  if (keyMatch) {
    ticketKey = ticketKey || keyMatch[1];
    title = keyMatch[2].trim();
  }

  if (!title) {
    const summaryMatch = inputText.match(/(?:^|\n)(?:Summary|Title)[:\s]*(.+)/i);
    if (summaryMatch) {
      title = summaryMatch[1].trim();
    }
  }

  if (!title) {
    const firstLine = inputText.split('\n').find(l => l.trim() && !l.startsWith('**') && !l.startsWith('#'));
    if (firstLine) {
      title = firstLine.replace(/^#+\s*/, '').replace(/^[A-Z][A-Z0-9]+-\d+[:\s-]*/, '').trim();
      if (title.length > 80) title = title.substring(0, 80).trim();
    }
  }

  if (ticketKey && title) return `${ticketKey} - ${title}`;
  if (ticketKey) return ticketKey;
  if (title) return title;
  return '';
}

async function showQasePushDialog(markdown, btn, defaultSuiteName = '') {
  let suites = [];
  try {
    const res = await fetch('/api/qase/suites');
    const data = await res.json();
    suites = data.suites || [];
  } catch (e) { /* will just show manual input */ }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const suitesJson = JSON.stringify(suites.map(s => ({ id: s.id, title: s.title })));

  overlay.innerHTML = `
    <div class="modal-box">
      <h3>Push Test Cases to Qase</h3>

      <div class="modal-field">
        <label>Destination</label>
        <select id="qase-dest-type">
          <option value="new">Create new suite</option>
          <option value="existing">Add to existing suite</option>
        </select>
      </div>

      <div id="qase-new-fields">
        <div class="modal-field">
          <label>Suite Name</label>
          <input type="text" id="qase-suite-name" placeholder="e.g., ENG-12345 - Login Feature Tests" value="${escapeAttr(defaultSuiteName)}" />
        </div>
        <div class="modal-field">
          <label>Parent Folder (optional)</label>
          <div class="searchable-select" id="parent-select-wrap">
            <input type="text" class="searchable-input" id="qase-parent-search" placeholder="Search folders..." autocomplete="off" />
            <input type="hidden" id="qase-parent-select" value="" />
            <div class="searchable-dropdown" id="parent-dropdown"></div>
          </div>
        </div>
      </div>

      <div id="qase-existing-fields" style="display:none">
        <div class="modal-field">
          <label>Select Suite</label>
          <div class="searchable-select" id="existing-select-wrap">
            <input type="text" class="searchable-input" id="qase-existing-search" placeholder="Search suites..." autocomplete="off" />
            <input type="hidden" id="qase-existing-select" value="" />
            <div class="searchable-dropdown" id="existing-dropdown"></div>
          </div>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn-modal-cancel" id="qase-cancel">Cancel</button>
        <button class="btn-modal-confirm" id="qase-confirm">Push to Qase</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const allSuites = JSON.parse(suitesJson);
  initSearchableSelect('qase-parent-search', 'qase-parent-select', 'parent-dropdown', allSuites, true);
  initSearchableSelect('qase-existing-search', 'qase-existing-select', 'existing-dropdown', allSuites, false);

  const destType = document.getElementById('qase-dest-type');
  const newFields = document.getElementById('qase-new-fields');
  const existingFields = document.getElementById('qase-existing-fields');

  destType.addEventListener('change', () => {
    newFields.style.display = destType.value === 'new' ? 'block' : 'none';
    existingFields.style.display = destType.value === 'existing' ? 'block' : 'none';
  });

  function closeModal() {
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 250);
  }

  document.getElementById('qase-cancel').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  _activeModalClose = closeModal;

  document.getElementById('qase-confirm').addEventListener('click', async () => {
    const confirmBtn = document.getElementById('qase-confirm');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Pushing...';

    let suiteId = null;
    let suiteName = '';
    let parentId = null;

    if (destType.value === 'existing') {
      suiteId = document.getElementById('qase-existing-select').value;
      if (!suiteId) {
        showToast('Please select a suite.', 'error');
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Push to Qase';
        return;
      }
    } else {
      suiteName = document.getElementById('qase-suite-name').value.trim();
      if (!suiteName) {
        showToast('Please enter a suite name.', 'error');
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Push to Qase';
        return;
      }
      parentId = document.getElementById('qase-parent-select').value || null;
    }

    try {
      const res = await fetch('/api/qase/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown,
          suite_name: suiteName,
          suite_id: suiteId,
          parent_id: parentId,
        }),
      });

      const data = await res.json();
      closeModal();

      const resultEl = document.getElementById('qase-push-result');
      if (data.error) {
        showToast(`Qase error: ${data.error}`, 'error');
      } else {
        btn.innerHTML = '<i data-lucide="check" class="btn-icon"></i> Pushed!';
        refreshIcons();
        btn.disabled = true;
        resultEl.innerHTML = `${data.cases_created} cases → <a href="${data.suite_url}" target="_blank">Open in Qase</a>`;
        resultEl.hidden = false;
        showToast(`${data.cases_created} test cases pushed to Qase!`, 'success');
      }
    } catch (err) {
      closeModal();
      showToast('Failed to push to Qase. Check your connection.', 'error');
    }
  });
}

function initSearchableSelect(searchId, hiddenId, dropdownId, items, allowEmpty) {
  const searchInput = document.getElementById(searchId);
  const hiddenInput = document.getElementById(hiddenId);
  const dropdown = document.getElementById(dropdownId);

  function renderItems(filter = '') {
    const lowerFilter = filter.toLowerCase();
    const filtered = items.filter(s => s.title.toLowerCase().includes(lowerFilter));

    let html = '';
    if (allowEmpty) {
      html += `<div class="searchable-item ${!hiddenInput.value ? 'selected' : ''}" data-id="" data-title="— No parent (root level) —">— No parent (root level) —</div>`;
    }
    filtered.forEach(s => {
      const isSelected = String(s.id) === hiddenInput.value;
      html += `<div class="searchable-item ${isSelected ? 'selected' : ''}" data-id="${s.id}" data-title="${escapeAttr(s.title)}">${s.title}</div>`;
    });

    if (!filtered.length && !allowEmpty) {
      html = '<div class="searchable-empty">No results found</div>';
    }

    dropdown.innerHTML = html;

    dropdown.querySelectorAll('.searchable-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        hiddenInput.value = item.dataset.id;
        searchInput.value = item.dataset.id ? item.dataset.title : '';
        dropdown.classList.remove('open');
      });
    });
  }

  searchInput.addEventListener('focus', () => {
    renderItems(searchInput.value);
    dropdown.classList.add('open');
  });

  searchInput.addEventListener('input', () => {
    hiddenInput.value = '';
    renderItems(searchInput.value);
    dropdown.classList.add('open');
  });

  searchInput.addEventListener('blur', () => {
    setTimeout(() => dropdown.classList.remove('open'), 150);
  });

  renderItems();
}

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="check" class="btn-icon"></i> Copied!';
    refreshIcons();
    setTimeout(() => { btn.innerHTML = orig; refreshIcons(); }, 1500);
  });
}

function copyHtml(html, btn) {
  const blob = new Blob([html], { type: 'text/html' });
  const item = new ClipboardItem({ 'text/html': blob });
  navigator.clipboard.write([item]).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="check" class="btn-icon"></i> Copied!';
    refreshIcons();
    setTimeout(() => { btn.innerHTML = orig; refreshIcons(); }, 1500);
  });
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function shakeElement(el) {
  el.style.animation = 'none';
  el.offsetHeight;
  el.style.animation = 'shake .4s ease';
  el.style.borderColor = 'var(--red)';
  setTimeout(() => { el.style.borderColor = ''; }, 1500);
}

/* ─── Settings ─── */
function getSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_STORAGE) || '{}'); }
  catch { return {}; }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_STORAGE, JSON.stringify(settings));
}

async function refreshConfigStatus() {
  const el = document.getElementById('settings-status');
  if (!el) return;
  try {
    const res = await fetch('/api/config/status');
    const data = await res.json();
    const items = [
      { key: 'openai', label: 'OpenAI' },
      { key: 'jira', label: 'Jira' },
      { key: 'qase', label: 'Qase' },
    ];
    el.innerHTML = items.map(i => {
      const ok = data[i.key];
      return `<span class="config-badge ${ok ? 'config-ok' : 'config-missing'}">
        <i data-lucide="${ok ? 'check-circle' : 'alert-circle'}" class="config-badge-icon"></i>
        ${i.label}: ${ok ? 'Connected' : 'Not configured'}
      </span>`;
    }).join('');
    refreshIcons();
  } catch (e) { /* ignore */ }
}

async function initSettings() {
  const settings = getSettings();

  const fields = {
    'settings-openai-key': settings.openaiKey || '',
    'settings-jira-url': settings.jiraUrl || '',
    'settings-jira-email': settings.jiraEmail || '',
    'settings-jira-token': settings.jiraToken || '',
    'settings-qase-token': settings.qaseToken || '',
    'settings-qase-project': settings.qaseProject || '',
    'settings-jira-user': settings.jiraUser || '',
    'settings-default-space': settings.defaultSpace || 'ENG',
    'settings-default-type': settings.defaultType || 'Defect',
    'settings-default-labels': (settings.defaultLabels || []).join(', '),
    'settings-default-suite-parent': settings.defaultSuiteParent || '',
    'settings-ai-model': settings.aiModel || 'gpt-4o',
    'settings-notif-enabled': settings.notifEnabled || 'on',
    'settings-notif-interval': settings.notifInterval || 60,
  };

  for (const [id, val] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  const teamSelect = document.getElementById('settings-default-team');
  if (teamSelect) {
    try {
      const res = await fetch('/api/jira/meta');
      const meta = await res.json();
      const teams = meta.feature_teams || [];
      teams.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.value;
        if (settings.defaultTeam === t.id) opt.selected = true;
        teamSelect.appendChild(opt);
      });
    } catch {}
  }

  // Also sync jira user to daily summary field
  if (settings.jiraUser) {
    const dailyUser = document.getElementById('daily-jira-user');
    if (dailyUser && !dailyUser.value) dailyUser.value = settings.jiraUser;
  }

  document.getElementById('settings-save-btn').addEventListener('click', () => {
    const newSettings = {
      jiraUser: document.getElementById('settings-jira-user').value.trim(),
      defaultSpace: document.getElementById('settings-default-space').value.trim() || 'ENG',
      defaultType: document.getElementById('settings-default-type').value,
      defaultTeam: document.getElementById('settings-default-team').value,
      defaultLabels: document.getElementById('settings-default-labels').value
        .split(',').map(l => l.trim()).filter(Boolean),
      defaultSuiteParent: document.getElementById('settings-default-suite-parent').value.trim(),
      aiModel: document.getElementById('settings-ai-model').value,
      notifEnabled: document.getElementById('settings-notif-enabled').value,
      notifInterval: parseInt(document.getElementById('settings-notif-interval').value) || 60,
      openaiKey: document.getElementById('settings-openai-key').value.trim(),
      jiraUrl: document.getElementById('settings-jira-url').value.trim(),
      jiraEmail: document.getElementById('settings-jira-email').value.trim(),
      jiraToken: document.getElementById('settings-jira-token').value.trim(),
      qaseToken: document.getElementById('settings-qase-token').value.trim(),
      qaseProject: document.getElementById('settings-qase-project').value.trim(),
    };
    const quickSel = document.getElementById('model-quick-select');
    if (quickSel) quickSel.value = newSettings.aiModel;
    saveSettings(newSettings);
    localStorage.setItem('qa-copilot-jira-user', newSettings.jiraUser);
    restartNotifPolling(newSettings);
    showToast('Settings saved', 'success');
    refreshConfigStatus();
  });

  document.getElementById('settings-reset-btn').addEventListener('click', () => {
    localStorage.removeItem(SETTINGS_STORAGE);
    document.getElementById('settings-openai-key').value = '';
    document.getElementById('settings-jira-url').value = '';
    document.getElementById('settings-jira-email').value = '';
    document.getElementById('settings-jira-token').value = '';
    document.getElementById('settings-qase-token').value = '';
    document.getElementById('settings-qase-project').value = '';
    document.getElementById('settings-jira-user').value = '';
    document.getElementById('settings-default-space').value = 'ENG';
    document.getElementById('settings-default-type').value = 'Defect';
    document.getElementById('settings-default-team').value = '';
    document.getElementById('settings-default-labels').value = '';
    document.getElementById('settings-default-suite-parent').value = '';
    showToast('Settings reset to defaults', 'success');
    refreshConfigStatus();
  });

  refreshConfigStatus();
}

const shakeStyle = document.createElement('style');
shakeStyle.textContent = `@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}`;
document.head.appendChild(shakeStyle);

function initAnalyzeGenTC() {
  const btn = document.getElementById('analyze-gen-tc-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const textarea = document.getElementById('analyze-input');
    const text = textarea.value.trim();
    if (!text) { shakeElement(textarea); return; }
    const jiraKey = document.getElementById('analyze-jira-key').value.trim();
    switchToTestCasesWithInput(text, jiraKey);
  });
}

/* ─── Daily Summary ─── */
function initDailySummary() {
  const localBtn = document.getElementById('source-local');
  const jiraBtn = document.getElementById('source-jira');
  const localFields = document.getElementById('daily-local-fields');
  const jiraFields = document.getElementById('daily-jira-fields');
  const genBtn = document.getElementById('daily-generate-btn');

  if (!localBtn || !genBtn) return;

  const dateInput = document.getElementById('daily-jira-date');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

  const savedUser = localStorage.getItem('qa-copilot-jira-user');
  if (savedUser) {
    const userInput = document.getElementById('daily-jira-user');
    if (userInput) userInput.value = savedUser;
  }

  localBtn.addEventListener('click', () => {
    localBtn.classList.add('active');
    jiraBtn.classList.remove('active');
    localFields.hidden = false;
    jiraFields.hidden = true;
  });

  jiraBtn.addEventListener('click', () => {
    jiraBtn.classList.add('active');
    localBtn.classList.remove('active');
    jiraFields.hidden = false;
    localFields.hidden = true;
  });

  genBtn.addEventListener('click', async () => {
    const isJira = jiraBtn.classList.contains('active');
    const btnText = genBtn.querySelector('.btn-text');
    const btnLoader = genBtn.querySelector('.btn-loader');
    const output = document.getElementById('daily-output');

    genBtn.disabled = true;
    btnText.hidden = true;
    btnLoader.hidden = false;

    output.innerHTML = '<div class="ai-progress"><div class="ai-progress-bar"></div></div><div class="output-content streaming-cursor"></div>';
    const contentEl = output.querySelector('.output-content');
    const dailyPB = output.querySelector('.ai-progress-bar');
    let dailyProgress = 5;
    const dailyPI = setInterval(() => { if (dailyProgress < 90) { dailyProgress += Math.random() * 8; if (dailyPB) dailyPB.style.width = `${Math.min(dailyProgress, 90)}%`; } }, 400);

    let body = {};
    const today = new Date().toISOString().split('T')[0];

    if (isJira) {
      const username = document.getElementById('daily-jira-user').value.trim();
      const date = document.getElementById('daily-jira-date').value;
      const extra = document.getElementById('daily-extra').value.trim();

      if (!username) {
        showToast('Enter your Jira username', 'error');
        clearInterval(dailyPI);
        const p2 = output.querySelector('.ai-progress'); if (p2) p2.remove();
        genBtn.disabled = false;
        btnText.hidden = false;
        btnLoader.hidden = true;
        return;
      }

      localStorage.setItem('qa-copilot-jira-user', username);
      body = { source: 'jira', username, date, extra };
    } else {
      const history = getHistory().filter(h => {
        return h.date && h.date.startsWith(today.replace(/-/g, '/').replace(/^(\d{4})\/(\d{2})\/(\d{2})/, (m, y, mo, d) => `${parseInt(mo)}/${parseInt(d)}/${y}`))
          || h.date && h.date.includes(today);
      });

      const todayHistory = getTodayHistory();
      const extra = '';

      if (!todayHistory.length) {
        clearInterval(dailyPI);
        const p3 = output.querySelector('.ai-progress'); if (p3) p3.remove();
        contentEl.classList.remove('streaming-cursor');
        contentEl.innerHTML = '<p>No activity in QA Copilot today. Try the Jira source instead.</p>';
        genBtn.disabled = false;
        btnText.hidden = false;
        btnLoader.hidden = true;
        return;
      }

      body = { source: 'local', history: todayHistory, date: today };
    }

    body.model = getSelectedModel();

    try {
      const res = await fetch('/api/daily/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        contentEl.classList.remove('streaming-cursor');
        contentEl.innerHTML = renderErrorCard(err.error || 'Something went wrong');
        showToast(err.error || 'Error', 'error');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        contentEl.innerHTML = marked.parse(fullText);
      }

      clearInterval(dailyPI);
      if (dailyPB) { dailyPB.style.width = '100%'; setTimeout(() => { const p = output.querySelector('.ai-progress'); if (p) p.remove(); }, 400); }
      contentEl.classList.remove('streaming-cursor');

      const actions = document.createElement('div');
      actions.className = 'output-actions';
      actions.innerHTML = `
        <button class="btn-copy" data-text="${escapeAttr(fullText)}"><i data-lucide="clipboard" class="btn-icon"></i> Copy Markdown</button>
        <button class="btn-copy btn-copy-html" data-html="true"><i data-lucide="file-text" class="btn-icon"></i> Copy Formatted</button>
      `;
      output.insertBefore(actions, contentEl);
      refreshIcons();

      actions.querySelectorAll('.btn-copy').forEach(copyBtn => {
        copyBtn.addEventListener('click', () => {
          if (copyBtn.dataset.html) {
            copyHtml(contentEl.innerHTML, copyBtn);
          } else {
            copyText(copyBtn.dataset.text, copyBtn);
          }
        });
      });

      showToast('Daily summary ready!', 'success');
    } catch (err) {
      clearInterval(dailyPI);
      const p = output.querySelector('.ai-progress'); if (p) p.remove();
      contentEl.classList.remove('streaming-cursor');
      contentEl.innerHTML = renderErrorCard('Connection error.');
      showToast('Connection error', 'error');
    } finally {
      genBtn.disabled = false;
      btnText.hidden = false;
      btnLoader.hidden = true;
    }
  });
}

function getTodayHistory() {
  const today = new Date();
  const todayStr = today.toLocaleDateString();
  return getHistory().filter(h => {
    if (!h.date) return false;
    return h.date.startsWith(todayStr) || h.date.includes(today.toISOString().split('T')[0]);
  });
}

/* ─── Bulk Analyze ─── */
function initBulkAnalyze() {
  const btn = document.getElementById('bulk-analyze-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const keyInput = document.getElementById('analyze-jira-key');
    const raw = keyInput.value.trim();
    if (!raw) { shakeElement(keyInput); return; }

    const keys = raw.split(/[,\s]+/).map(k => k.trim().toUpperCase()).filter(k => /^[A-Z][A-Z0-9]+-\d+$/.test(k));
    if (!keys.length) {
      showToast('Enter valid Jira keys separated by commas', 'error');
      return;
    }

    if (keys.length === 1) {
      document.querySelector('.btn-fetch[data-target="analyze-input"]').click();
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Loading...';
    const output = document.getElementById('analyze-output');
    output.innerHTML = '<div class="output-content streaming-cursor"><p>Fetching and analyzing ' + keys.length + ' stories...</p></div>';

    let results = [];
    for (const key of keys) {
      try {
        const res = await fetch(`/api/jira/fetch?key=${encodeURIComponent(key)}`);
        const data = await res.json();
        if (data.error) {
          results.push({ key, error: data.error });
        } else {
          results.push({ key, text: data.text });
          saveRecentKey(key);
        }
      } catch {
        results.push({ key, error: 'Failed to fetch' });
      }
    }

    output.innerHTML = '';
    const contentEl = document.createElement('div');
    contentEl.className = 'output-content';
    output.appendChild(contentEl);

    for (const item of results) {
      if (item.error) {
        contentEl.innerHTML += `<div class="bulk-item"><h2><i data-lucide="circle-x" class="header-icon" style="color:var(--red)"></i> ${item.key}</h2><p>Error: ${item.error}</p></div><hr/>`;
        refreshIcons();
        continue;
      }

      contentEl.innerHTML += `<div class="bulk-item" id="bulk-${item.key}"><h2><i data-lucide="loader" class="header-icon spin"></i> ${item.key}</h2><p>Analyzing...</p></div><hr/>`;
      refreshIcons();

      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ story: item.text }),
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        const itemEl = document.getElementById(`bulk-${item.key}`);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += decoder.decode(value, { stream: true });
          itemEl.innerHTML = `<h2><i data-lucide="scan-search" class="header-icon"></i> ${item.key}</h2>` + marked.parse(fullText);
          refreshIcons();
        }

        saveHistory(`${item.key} — Analyze`, 'Analyze', fullText, item.text, item.key);
      } catch {
        const itemEl = document.getElementById(`bulk-${item.key}`);
        if (itemEl) {
          itemEl.innerHTML = `<h2><i data-lucide="circle-x" class="header-icon" style="color:var(--red)"></i> ${item.key}</h2><p>Analysis failed</p>`;
          refreshIcons();
        }
      }
    }

    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="zap" class="btn-icon"></i> Bulk';
    refreshIcons();
    showToast(`Bulk analysis complete: ${keys.length} stories`, 'success');
  });
}

/* ─── History ─── */
function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_STORAGE) || '[]'); }
  catch { return []; }
}

function saveHistory(label, type, result, input, jiraKey) {
  let history = getHistory();
  history.unshift({
    id: Date.now(),
    label,
    type,
    result,
    input,
    jiraKey,
    date: new Date().toLocaleString(),
  });
  history = history.slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_STORAGE, JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const container = document.getElementById('history-list');
  if (!container) return;
  const history = getHistory();

  if (!history.length) {
    container.innerHTML = '<div class="history-empty">No history yet</div>';
    return;
  }

  container.innerHTML = history.map(h => {
    const iconName = h.type === 'Analyze' ? 'scan-search' : h.type === 'Test Cases' ? 'clipboard-check' : 'bug';
    const isFav = getFavorites().some(f => f.label === h.label && f.type === h.type);
    return `<div class="history-item" data-id="${h.id}">
      <span class="history-icon"><i data-lucide="${iconName}" style="width:13px;height:13px"></i></span>
      <span class="history-info">
        <span class="history-label">${escapeAttr(h.label)}</span>
        <span class="history-date">${h.date}</span>
      </span>
      <button class="history-fav ${isFav ? 'is-fav' : ''}" data-id="${h.id}" title="${isFav ? 'Already in favorites' : 'Add to favorites'}"><i data-lucide="star" style="width:12px;height:12px"></i></button>
      <button class="history-delete" data-id="${h.id}" title="Delete"><i data-lucide="x" style="width:12px;height:12px"></i></button>
    </div>`;
  }).join('');
  refreshIcons();

  if (!container._histBound) {
    container._histBound = true;
    container.addEventListener('click', (e) => {
      const currentHistory = getHistory();
      const favBtn = e.target.closest('.history-fav');
      if (favBtn) {
        e.stopPropagation();
        const entry = currentHistory.find(h => h.id === Number(favBtn.dataset.id));
        if (!entry) return;
        const existing = getFavorites().find(f => f.label === entry.label && f.type === entry.type);
        if (existing) {
          let f = getFavorites().filter(x => x.id !== existing.id);
          localStorage.setItem(FAVORITES_STORAGE, JSON.stringify(f));
          renderFavorites();
          favBtn.classList.remove('is-fav');
          favBtn.title = 'Add to favorites';
          showToast('Removed from favorites', 'success');
        } else {
          addFavorite(entry.label, entry.type, entry.result, entry.input, entry.jiraKey);
          favBtn.classList.add('is-fav');
          favBtn.title = 'Remove from favorites';
        }
        refreshIcons();
        return;
      }
      const delBtn = e.target.closest('.history-delete');
      if (delBtn) {
        e.stopPropagation();
        let h = getHistory().filter(x => x.id !== Number(delBtn.dataset.id));
        localStorage.setItem(HISTORY_STORAGE, JSON.stringify(h));
        renderHistory();
        return;
      }
      const item = e.target.closest('.history-item');
      if (item) {
        const entry = currentHistory.find(h => h.id === Number(item.dataset.id));
        if (entry) loadHistoryEntry(entry);
      }
    });
  }
}

function loadHistoryEntry(entry) {
  const tabMap = { 'Analyze': 'analyze', 'Test Cases': 'testcases', 'Bug Report': 'bugreport' };
  const tab = tabMap[entry.type] || 'analyze';

  switchTab(tab);

  const textarea = document.getElementById(`${tab}-input`);
  if (textarea) textarea.value = entry.input;

  const preview = document.getElementById(`${tab}-preview`);
  const toggle = document.getElementById(`${tab}-toggle`);
  if (preview && entry.input) {
    preview.innerHTML = marked.parse(entry.input);
    preview.hidden = false;
    if (textarea) textarea.classList.add('textarea-collapsed');
    if (toggle) {
      toggle.hidden = false;
      toggle.textContent = 'Edit raw text';
      toggle.onclick = () => {
        const isHidden = textarea.classList.contains('textarea-collapsed');
        textarea.classList.toggle('textarea-collapsed');
        preview.hidden = isHidden;
        toggle.textContent = isHidden ? 'Edit raw text' : 'Show preview';
      };
    }
  }

  const output = document.getElementById(`${tab}-output`);
  if (output) {
    const isFav = getFavorites().some(f => f.label === entry.label && f.type === entry.type);
    const favBtnHtml = `<div class="output-actions" style="margin-bottom:12px;">
      <button class="btn-favorite ${isFav ? 'is-fav' : ''}" data-role="history-fav">
        <i data-lucide="star" class="btn-icon"></i> ${isFav ? 'Saved' : 'Favorite'}
      </button>
    </div>`;
    output.innerHTML = favBtnHtml + `<div class="output-content">${marked.parse(entry.result)}</div>`;
    refreshIcons();

    const favBtn = output.querySelector('[data-role="history-fav"]');
    if (favBtn) {
      favBtn.addEventListener('click', () => {
        const existing = getFavorites().find(f => f.label === entry.label && f.type === entry.type);
        if (existing) {
          let f = getFavorites().filter(x => x.id !== existing.id);
          localStorage.setItem(FAVORITES_STORAGE, JSON.stringify(f));
          renderFavorites();
          renderHistory();
          favBtn.classList.remove('is-fav');
          favBtn.innerHTML = '<i data-lucide="star" class="btn-icon"></i> Favorite';
          showToast('Removed from favorites', 'success');
        } else {
          addFavorite(entry.label, entry.type, entry.result, entry.input, entry.jiraKey);
          renderHistory();
          favBtn.classList.add('is-fav');
          favBtn.innerHTML = '<i data-lucide="star" class="btn-icon"></i> Saved';
        }
        refreshIcons();
      });
    }
  }

  if (entry.jiraKey) {
    const keyInput = document.getElementById(`${tab}-jira-key`);
    if (keyInput) keyInput.value = entry.jiraKey;
  }

  showToast('History entry loaded', 'success');
}

function initHistory() {
  renderHistory();
  const clearBtn = document.getElementById('history-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      localStorage.removeItem(HISTORY_STORAGE);
      renderHistory();
      showToast('History cleared', 'success');
    });
  }
}

/* ─── Dashboard ─── */
const QA_TIPS = [
  "Always test edge cases: empty strings, zero values, negative numbers, and maximum lengths.",
  "Write test cases before you start testing — it helps you think about all scenarios upfront.",
  "A good bug report tells the developer exactly how to reproduce the issue in under 2 minutes.",
  "Don't just test the happy path. Think about what happens when things go wrong.",
  "Exploratory testing often finds bugs that scripted tests miss. Schedule time for it.",
  "When you find a bug, check related features — similar issues often cluster together.",
  "Regression testing is not optional. Automate what you can, and track what you can't.",
  "The best QA feedback is specific, actionable, and tied to user impact.",
  "Use equivalence partitioning: if 1–100 is valid, test 0, 1, 50, 100, and 101.",
  "Take screenshots and record sessions — visual evidence makes bug reports 10x more effective.",
  "Test on different browsers and devices. What works on Chrome may break on Safari.",
  "Ask 'What if?' often: What if the network drops? What if the user double-clicks?",
];

function refreshDashboard() {
  const history = getHistory();
  const today = new Date().toLocaleDateString();

  const todayItems = history.filter(h => {
    if (!h.date) return false;
    try { return new Date(h.date).toLocaleDateString() === today; } catch { return false; }
  });

  const analyses = todayItems.filter(h => h.type === 'Analyze').length;
  const testcases = todayItems.filter(h => h.type === 'Test Cases').length;
  const bugs = todayItems.filter(h => h.type === 'Bug Report').length;

  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  el('dash-val-analyses', analyses);
  el('dash-val-testcases', testcases);
  el('dash-val-bugs', bugs);
  el('dash-val-total', history.length);

  const recentList = document.getElementById('dash-recent-list');
  if (recentList) {
    const recent = history.slice(0, 6);
    if (!recent.length) {
      recentList.innerHTML = '<div class="dash-empty">No recent activity</div>';
    } else {
      const typeMap = { 'Analyze': 'analyze', 'Test Cases': 'testcases', 'Bug Report': 'bugreport' };
      const iconMap = { 'Analyze': 'scan-search', 'Test Cases': 'clipboard-check', 'Bug Report': 'bug' };
      recentList.innerHTML = recent.map(h => {
        const cls = typeMap[h.type] || 'analyze';
        const icon = iconMap[h.type] || 'file-text';
        return `<div class="dash-recent-item" data-type="${cls}" data-id="${h.id}">
          <div class="dash-recent-icon type-${cls}"><i data-lucide="${icon}"></i></div>
          <div class="dash-recent-body">
            <div class="dash-recent-label">${h.label || h.type}</div>
            <div class="dash-recent-time">${h.date || ''}</div>
          </div>
        </div>`;
      }).join('');

      recentList.querySelectorAll('.dash-recent-item').forEach(item => {
        item.addEventListener('click', () => {
          const id = parseInt(item.dataset.id);
          const entry = history.find(h => h.id === id);
          if (!entry) return;
          const tabMap = { 'Analyze': 'analyze', 'Test Cases': 'testcases', 'Bug Report': 'bugreport' };
          const tab = tabMap[entry.type] || 'analyze';
          switchTab(tab);
          const output = document.getElementById(`${tab}-output`);
          if (output) output.innerHTML = `<div class="output-content">${marked.parse(entry.result)}</div>`;
        });
      });
    }
  }

  const tipEl = document.querySelector('#dash-tip p');
  if (tipEl) {
    tipEl.textContent = QA_TIPS[Math.floor(Math.random() * QA_TIPS.length)];
  }

  document.querySelectorAll('.dash-action-btn[data-goto]').forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.goto);
  });

  const refreshBtn = document.getElementById('dash-jira-refresh');
  if (refreshBtn) {
    refreshBtn.onclick = () => fetchDashJiraIssues();
  }

  fetchDashJiraIssues();
  fetchSprintWidget();
  initDashSearch();
  initSuggestions();
  refreshIcons();
}

async function fetchDashJiraIssues() {
  const settings = getSettings();
  const username = settings.jiraUser || '';
  const list = document.getElementById('dash-jira-list');
  const countBadge = document.getElementById('dash-jira-count');
  const refreshBtn = document.getElementById('dash-jira-refresh');

  if (!list) return;

  list.innerHTML = '<div class="dash-empty"><i data-lucide="loader" class="spin" style="width:16px;height:16px"></i> Loading...</div>';
  refreshIcons();
  if (refreshBtn) refreshBtn.classList.add('loading');

  try {
    const res = await fetch(`/api/jira/my-issues?username=${encodeURIComponent(username)}`);
    const data = await res.json();

    if (refreshBtn) refreshBtn.classList.remove('loading');

    if (data.error && !data.issues.length) {
      list.innerHTML = `<div class="dash-empty">${data.error}</div>`;
      if (countBadge) countBadge.textContent = '0';
      return;
    }

    const issues = data.issues || [];
    const boards = data.boards || {};
    if (countBadge) countBadge.textContent = data.total || issues.length;
    _cachedIssues = issues;

    if (!issues.length) {
      list.innerHTML = '<div class="dash-empty">No open issues assigned to you</div>';
      return;
    }

    const BOARD1_STATUSES = ['Backlog', 'To Do', 'In Progress', 'Ready for QA', 'In QA', 'Ready To Release'];
    const BOARD2_STATUSES = ['Work in progress', 'Waiting for customer', 'QA Review'];
    const BOARD3_PROJECTS = ['RFTR'];

    const normalize = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const board1Norm = BOARD1_STATUSES.map(normalize);
    const board2Norm = BOARD2_STATUSES.map(normalize);

    const board1Issues = issues.filter(iss => !BOARD3_PROJECTS.includes(iss.project));

    const grouped = {};
    const extraStatuses = new Set();
    for (const iss of board1Issues) {
      const status = iss.status || 'Other';
      if (!grouped[status]) grouped[status] = [];
      grouped[status].push(iss);
      const norm = normalize(status);
      if (!board1Norm.includes(norm) && !board2Norm.includes(norm)) {
        extraStatuses.add(status);
      }
    }

    function renderKanbanCard(iss) {
      const typeLower = (iss.type || '').toLowerCase();
      const typeClass = typeLower.includes('bug') || typeLower.includes('defect') ? 't-bug' :
                        typeLower.includes('story') ? 't-story' :
                        typeLower.includes('task') ? 't-task' : 't-default';
      const typeIcon = typeLower.includes('bug') || typeLower.includes('defect') ? 'bug' :
                       typeLower.includes('story') ? 'book-open' :
                       typeLower.includes('task') ? 'check-square' : 'file-text';
      return `<div class="kanban-card">
        <div class="kanban-card-top">
          <a class="kanban-card-key" href="${iss.url}" target="_blank" rel="noopener">${iss.key}</a>
          <span class="kanban-card-type ${typeClass}"><i data-lucide="${typeIcon}"></i></span>
        </div>
        <a class="kanban-card-summary" href="${iss.url}" target="_blank" rel="noopener">${_esc(iss.summary)}</a>
        <div class="kanban-card-footer">
          <span class="kanban-card-priority">${iss.priority || ''}</span>
          <div class="kanban-card-actions">
            <button class="kanban-action" title="AI Summary" data-action="summary" data-key="${iss.key}"><i data-lucide="sparkles"></i></button>
            <button class="kanban-action" title="Analyze Story" data-action="analyze" data-key="${iss.key}"><i data-lucide="scan-search"></i></button>
            <button class="kanban-action" title="Generate Test Cases" data-action="testcases" data-key="${iss.key}"><i data-lucide="clipboard-check"></i></button>
            <a class="kanban-action" title="Open in Jira" href="${iss.url}" target="_blank" rel="noopener"><i data-lucide="external-link"></i></a>
          </div>
        </div>
      </div>`;
    }

    function renderColumn(status, colClass) {
      const cards = grouped[status] || [];
      return `<div class="kanban-col ${colClass}">
        <div class="kanban-col-header">
          <span class="kanban-col-title">${status}</span>
          <span class="kanban-col-count">${cards.length}</span>
        </div>
        <div class="kanban-col-cards">
          ${cards.length ? cards.map(renderKanbanCard).join('') : '<div class="kanban-col-empty">No issues</div>'}
        </div>
      </div>`;
    }

    const colClassMap = (s) => {
      const n = normalize(s);
      if (n === 'backlog') return 'col-backlog';
      if (n === 'to do' || n === 'open') return 'col-todo';
      if (n.includes('in progress') || n === 'work in progress') return 'col-progress';
      if (n === 'ready for qa') return 'col-ready';
      if (n === 'in qa' || n === 'qa review') return 'col-qa';
      if (n.includes('release')) return 'col-release';
      if (n.includes('waiting') || n.includes('customer')) return 'col-waiting';
      return 'col-default';
    };

    const mainCount = board1Issues.filter(iss => {
      const n = normalize(iss.status || '');
      return board1Norm.includes(n) || (!board2Norm.includes(n));
    }).length;

    let html = `<div class="kanban-section" data-section="main">
      <div class="kanban-section-header" data-toggle="main">
        <i data-lucide="chevron-down" class="kanban-toggle-icon"></i>
        <span>Implementation Board (${mainCount})</span>
      </div>
      <div class="kanban-section-body">
        <div class="kanban-board">`;
    for (const status of BOARD1_STATUSES) {
      html += renderColumn(status, colClassMap(status));
    }
    for (const extra of extraStatuses) {
      const norm = normalize(extra);
      if (!board2Norm.includes(norm)) {
        html += renderColumn(extra, colClassMap(extra));
      }
    }
    html += '</div></div></div>';

    list.innerHTML = html;
    bindKanbanActions(list);
    bindKanbanToggles(list);
    refreshIcons();

    fetchBoardIssues(list, BOARD2_STATUSES, renderKanbanCard, colClassMap, normalize, 18, 'Production Incidents');
    fetchBoardIssues(list, null, renderKanbanCard, colClassMap, normalize, 28, 'RFTR Board — Feature Testing Results');

  } catch (err) {
    if (refreshBtn) refreshBtn.classList.remove('loading');
    list.innerHTML = '<div class="dash-empty">Failed to load Jira issues</div>';
  }
}

function bindKanbanToggles(container) {
  container.querySelectorAll('.kanban-section-header[data-toggle]').forEach(header => {
    if (header._bound) return;
    header._bound = true;
    const sectionId = header.dataset.toggle;
    const saved = localStorage.getItem('kanban-collapsed-' + sectionId);
    if (saved === '1') {
      header.closest('.kanban-section').classList.add('collapsed');
    }
    header.addEventListener('click', () => {
      const section = header.closest('.kanban-section');
      section.classList.toggle('collapsed');
      const isCollapsed = section.classList.contains('collapsed');
      localStorage.setItem('kanban-collapsed-' + sectionId, isCollapsed ? '1' : '0');
    });
  });
}

function bindKanbanActions(container) {
  container.querySelectorAll('.kanban-action[data-action]').forEach(btn => {
    if (btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.dataset.action === 'summary') {
        showAISummary(btn, btn.dataset.key);
      } else {
        kanbanQuickAction(btn.dataset.action, btn.dataset.key);
      }
    });
  });
}

async function fetchBoardIssues(list, fixedStatuses, renderKanbanCard, colClassMap, normalize, boardId, label) {
  const settings = getSettings();
  const username = settings.jiraUser || '';

  try {
    const res = await fetch(`/api/jira/board-issues?username=${encodeURIComponent(username)}&board_id=${boardId}`);
    const data = await res.json();
    const issues = data.issues || [];

    if (!issues.length) return;

    const grouped = {};
    const foundStatuses = [];
    for (const iss of issues) {
      const status = iss.status || 'Other';
      if (!grouped[status]) { grouped[status] = []; foundStatuses.push(status); }
      grouped[status].push(iss);
    }

    let columns;
    if (fixedStatuses) {
      columns = [...fixedStatuses];
      for (const s of foundStatuses) {
        if (!fixedStatuses.some(f => normalize(f) === normalize(s))) {
          columns.push(s);
        }
      }
    } else {
      columns = foundStatuses;
    }

    const sectionId = 'board-' + boardId;
    let html = `<div class="kanban-section" data-section="${sectionId}">
      <div class="kanban-section-header" data-toggle="${sectionId}">
        <i data-lucide="chevron-down" class="kanban-toggle-icon"></i>
        <span>${label} (${issues.length})</span>
      </div>
      <div class="kanban-section-body">
        <div class="kanban-board">`;
    for (const col of columns) {
      let cards = grouped[col] || [];
      if (!cards.length) {
        for (const [st, items] of Object.entries(grouped)) {
          if (normalize(st) === normalize(col)) { cards = items; break; }
        }
      }
      html += `<div class="kanban-col ${colClassMap(col)}">
        <div class="kanban-col-header">
          <span class="kanban-col-title">${col}</span>
          <span class="kanban-col-count">${cards.length}</span>
        </div>
        <div class="kanban-col-cards">
          ${cards.length ? cards.map(renderKanbanCard).join('') : '<div class="kanban-col-empty">No issues</div>'}
        </div>
      </div>`;
    }
    html += '</div></div></div>';

    list.insertAdjacentHTML('beforeend', html);
    bindKanbanActions(list);
    bindKanbanToggles(list);
    refreshIcons();
  } catch { /* silent */ }
}

/* ─── Sprint Widget ─── */
const SPRINT_BOARDS = [
  { id: 286, name: 'VicPay Q4' },
  { id: 82, name: '15. Victoria' },
  { id: 76, name: 'Product Enhancement' },
  { id: 54, name: '06. Feature (Filter & Sort)' },
  { id: 60, name: '09. Feature (AutoPost)' },
  { id: 68, name: 'Allocations' },
];

async function fetchSprintWidget() {
  const container = document.getElementById('dash-sprint');
  if (!container) return;
  try {
    const settings = getSettings();
    const boardId = settings.sprintBoardId || 286;

    const res = await fetch(`/api/jira/sprint?board_id=${boardId}`);
    const data = await res.json();
    const s = data.sprint;
    if (!s) {
      const boardOptions = SPRINT_BOARDS.map(b =>
        `<option value="${b.id}" ${b.id == boardId ? 'selected' : ''}>${b.name}</option>`
      ).join('');
      container.innerHTML = `<div class="dash-sprint-top" style="margin-bottom:0">
        <div class="dash-sprint-empty" style="flex:1">No active sprint on this board</div>
        <select class="dash-sprint-select" id="dash-sprint-select">${boardOptions}</select>
      </div>`;
      document.getElementById('dash-sprint-select').addEventListener('change', (e) => {
        const settings = getSettings();
        settings.sprintBoardId = parseInt(e.target.value);
        saveSettings(settings);
        fetchSprintWidget();
      });
      refreshIcons();
      return;
    }
    const start = new Date(s.startDate);
    const end = new Date(s.endDate);
    const now = new Date();
    const totalDays = Math.max(1, Math.ceil((end - start) / 86400000));
    const daysLeft = Math.max(0, Math.ceil((end - now) / 86400000));
    const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const boardOptions = SPRINT_BOARDS.map(b =>
      `<option value="${b.id}" ${b.id == boardId ? 'selected' : ''}>${b.name}</option>`
    ).join('');

    container.innerHTML = `
      <div class="dash-sprint-top">
        <div class="dash-sprint-name"><i data-lucide="zap" style="width:16px;height:16px;display:inline;vertical-align:-2px;color:var(--accent)"></i> ${_esc(s.name)}</div>
        <select class="dash-sprint-select" id="dash-sprint-select">${boardOptions}</select>
      </div>
      <div class="dash-sprint-dates">
        <span><i data-lucide="calendar" style="width:12px;height:12px;display:inline;vertical-align:-1px"></i> ${startStr} — ${endStr}</span>
        <span><i data-lucide="clock" style="width:12px;height:12px;display:inline;vertical-align:-1px"></i> ${daysLeft} days left</span>
      </div>
      <div class="dash-sprint-bar"><div class="dash-sprint-fill" style="width:${pct}%"></div></div>
      <div class="dash-sprint-stats">
        <span><strong>${s.done}</strong> / ${s.total} done (${pct}%)</span>
        <span><strong>${s.total - s.done}</strong> remaining</span>
      </div>`;

    document.getElementById('dash-sprint-select').addEventListener('change', (e) => {
      const newId = parseInt(e.target.value);
      const settings = getSettings();
      settings.sprintBoardId = newId;
      saveSettings(settings);
      fetchSprintWidget();
    });

    refreshIcons();
  } catch {
    container.innerHTML = '<div class="dash-sprint-empty">Failed to load sprint</div>';
  }
}

/* ─── Quick Jira Search ─── */
let _searchTimeout = null;
function initDashSearch() {
  const input = document.getElementById('dash-search-input');
  const results = document.getElementById('dash-search-results');
  if (!input || !results) return;

  input.addEventListener('input', () => {
    clearTimeout(_searchTimeout);
    const q = input.value.trim();
    if (q.length < 2) { results.classList.remove('open'); return; }
    _searchTimeout = setTimeout(() => dashSearch(q), 350);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { results.classList.remove('open'); input.blur(); }
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !results.contains(e.target)) {
      results.classList.remove('open');
    }
  });
}

async function dashSearch(query) {
  const results = document.getElementById('dash-search-results');
  results.innerHTML = '<div class="dash-empty" style="padding:12px">Searching...</div>';
  results.classList.add('open');

  try {
    const res = await fetch(`/api/jira/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    const items = data.results || [];
    if (!items.length) {
      results.innerHTML = '<div class="dash-empty" style="padding:12px">No results found</div>';
      return;
    }
    results.innerHTML = items.map(i =>
      `<a class="dash-search-item" href="${i.url}" target="_blank" rel="noopener">
        <span class="dash-search-item-key">${i.key}</span>
        <span class="dash-search-item-summary">${_esc(i.summary)}</span>
        <span class="dash-search-item-status">${i.status}</span>
      </a>`
    ).join('');
  } catch {
    results.innerHTML = '<div class="dash-empty" style="padding:12px">Search failed</div>';
  }
}

/* ─── AI Summary on Cards ─── */
async function showAISummary(btn, issueKey) {
  const existing = document.querySelector('.kanban-summary-overlay');
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement('div');
  overlay.className = 'kanban-summary-overlay';
  const popup = document.createElement('div');
  popup.className = 'kanban-summary-popup';
  popup.innerHTML = `
    <div class="kanban-summary-header">
      <h3><i data-lucide="sparkles" style="width:16px;height:16px;display:inline;vertical-align:-2px;color:var(--accent)"></i> AI Summary — ${_esc(issueKey)}</h3>
      <button class="kanban-summary-close" title="Close"><i data-lucide="x" style="width:16px;height:16px"></i></button>
    </div>
    <div class="kanban-summary-body" style="display:flex;align-items:center;gap:8px;color:var(--text-tertiary)">
      <i data-lucide="loader" class="spin" style="width:16px;height:16px"></i> Generating AI summary...
    </div>`;
  overlay.appendChild(popup);
  document.body.appendChild(overlay);
  refreshIcons();

  const close = () => { overlay.remove(); _activeModalClose = null; };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  popup.querySelector('.kanban-summary-close').addEventListener('click', close);
  _activeModalClose = close;

  try {
    const res = await fetch('/api/ai/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issue_key: issueKey, model: getSelectedModel() }),
    });
    const data = await res.json();
    const body = popup.querySelector('.kanban-summary-body');
    if (data.error) {
      body.innerHTML = `<span style="color:var(--red)">${_esc(data.error)}</span>`;
    } else {
      body.innerHTML = marked.parse(data.summary || 'No summary');
    }
  } catch {
    popup.querySelector('.kanban-summary-body').innerHTML = '<span style="color:var(--red)">Failed to generate summary</span>';
  }
  refreshIcons();
}

/* ─── Smart Suggestions ─── */
let _cachedIssues = [];
function initSuggestions() {
  const btn = document.getElementById('dash-suggestions-btn');
  if (!btn) return;
  btn.addEventListener('click', fetchSuggestions);
}

async function fetchSuggestions() {
  const btn = document.getElementById('dash-suggestions-btn');
  const body = document.getElementById('dash-suggestions-body');
  if (!btn || !body) return;

  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" class="spin" style="width:14px;height:14px"></i> Thinking...';
  refreshIcons();

  const settings = getSettings();
  const username = settings.jiraUser || '';

  try {
    let issues = _cachedIssues;
    if (!issues.length) {
      const res = await fetch(`/api/jira/my-issues?username=${encodeURIComponent(username)}`);
      const data = await res.json();
      issues = data.issues || [];
      _cachedIssues = issues;
    }

    const res = await fetch('/api/ai/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issues, model: getSelectedModel() }),
    });
    const data = await res.json();
    if (data.error) {
      body.innerHTML = `<div class="dash-empty" style="color:var(--red)">${_esc(data.error)}</div>`;
    } else {
      body.innerHTML = marked.parse(data.suggestions || 'No suggestions');
    }
  } catch {
    body.innerHTML = '<div class="dash-empty">Failed to get suggestions</div>';
  }

  btn.disabled = false;
  btn.innerHTML = '<i data-lucide="sparkles" style="width:14px;height:14px"></i> Get AI Suggestions';
  refreshIcons();
}

function kanbanQuickAction(action, jiraKey) {
  switchTab(action);

  const keyInputId = action === 'analyze' ? 'analyze-jira-key' : 'testcases-jira-key';
  const keyInput = document.getElementById(keyInputId);
  if (keyInput) {
    keyInput.value = jiraKey;
    saveRecentKey(jiraKey);
  }

  const fetchTarget = action === 'analyze' ? 'analyze-input' : 'testcases-input';
  const fetchBtn = document.querySelector(`.btn-fetch[data-target="${fetchTarget}"]`);
  if (fetchBtn) {
    setTimeout(() => fetchBtn.click(), 150);
  }
}

/* ─── Favorites ─── */
function getFavorites() {
  try { return JSON.parse(localStorage.getItem(FAVORITES_STORAGE) || '[]'); }
  catch { return []; }
}

function addFavorite(label, type, result, input, jiraKey) {
  let favs = getFavorites();
  favs.unshift({
    id: Date.now(),
    label,
    type,
    result,
    input,
    jiraKey,
    date: new Date().toLocaleString(),
  });
  favs = favs.slice(0, 20);
  localStorage.setItem(FAVORITES_STORAGE, JSON.stringify(favs));
  renderFavorites();
  showToast('Saved to favorites', 'success');
}

function renderFavorites() {
  const container = document.getElementById('favorites-list');
  const section = document.getElementById('sidebar-favorites');
  if (!container || !section) return;
  const favs = getFavorites();

  if (!favs.length) {
    container.innerHTML = '<div class="history-empty">No favorites yet</div>';
    return;
  }
  container.innerHTML = favs.map(h => {
    const iconName = h.type === 'Analyze' ? 'scan-search' : h.type === 'Test Cases' ? 'clipboard-check' : 'bug';
    return `<div class="history-item" data-id="${h.id}">
      <span class="history-icon"><i data-lucide="${iconName}" style="width:13px;height:13px"></i></span>
      <span class="history-info">
        <span class="history-label">${escapeAttr(h.label)}</span>
        <span class="history-date">${h.date}</span>
      </span>
      <button class="history-delete" data-id="${h.id}" title="Remove"><i data-lucide="x" style="width:12px;height:12px"></i></button>
    </div>`;
  }).join('');
  refreshIcons();

  if (!container._favBound) {
    container._favBound = true;
    container.addEventListener('click', (e) => {
      const delBtn = e.target.closest('.history-delete');
      if (delBtn) {
        e.stopPropagation();
        let f = getFavorites().filter(x => x.id !== Number(delBtn.dataset.id));
        localStorage.setItem(FAVORITES_STORAGE, JSON.stringify(f));
        renderFavorites();
        showToast('Removed from favorites', 'success');
        return;
      }
      const item = e.target.closest('.history-item');
      if (item) {
        const currentFavs = getFavorites();
        const entry = currentFavs.find(h => h.id === Number(item.dataset.id));
        if (entry) loadHistoryEntry(entry);
      }
    });
  }
}

function initFavorites() { renderFavorites(); }

/* ─── Drop Zone (Screenshot Drag & Drop) ─── */
function initDropZone() {
  const zone = document.getElementById('bug-drop-zone');
  const fileInput = document.getElementById('bug-file-input');
  const previewsEl = document.getElementById('bug-previews');
  if (!zone || !fileInput) return;

  zone.addEventListener('click', () => fileInput.click());

  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', () => {
    handleFiles(fileInput.files);
    fileInput.value = '';
  });

  function handleFiles(fileList) {
    for (const file of fileList) {
      if (!file.type.startsWith('image/')) continue;
      _uploadedFiles.push(file);
      addPreview(file, _uploadedFiles.length - 1);
    }
  }

  function addPreview(file, index) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const div = document.createElement('div');
      div.className = 'drop-preview';
      div.dataset.index = index;
      div.innerHTML = `<img src="${e.target.result}" /><button class="drop-preview-remove" title="Remove">×</button>`;
      previewsEl.appendChild(div);

      div.querySelector('.drop-preview-remove').addEventListener('click', () => {
        _uploadedFiles[index] = null;
        div.remove();
      });
    };
    reader.readAsDataURL(file);
  }
}

function getUploadedFileIds() {
  return _uploadedFiles.filter(Boolean);
}

async function uploadAndAttach(issueKey) {
  const files = getUploadedFileIds();
  if (!files.length) return;

  const formData = new FormData();
  files.forEach(f => formData.append('files', f));

  try {
    const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
    const uploadData = await uploadRes.json();
    if (uploadData.files && uploadData.files.length) {
      const fileIds = uploadData.files.map(f => f.id);
      await fetch('/api/jira/attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue_key: issueKey, file_ids: fileIds }),
      });
    }
  } catch (e) {
    showToast('Screenshots uploaded, but attach failed.', 'error');
  }

  _uploadedFiles = [];
  const previewsEl = document.getElementById('bug-previews');
  if (previewsEl) previewsEl.innerHTML = '';
}

/* ─── Fullscreen ─── */
function initFullscreen() {
  document.querySelectorAll('.btn-fullscreen').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.closest('.output-panel');
      if (panel.classList.contains('fullscreen-mode')) {
        panel.classList.remove('fullscreen-mode');
        btn.innerHTML = '<i data-lucide="maximize-2" style="width:14px;height:14px"></i>';
      } else {
        panel.classList.add('fullscreen-mode');
        btn.innerHTML = '<i data-lucide="minimize-2" style="width:14px;height:14px"></i>';
      }
      refreshIcons();
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const fs = document.querySelector('.output-panel.fullscreen-mode');
      if (fs) {
        fs.classList.remove('fullscreen-mode');
        const btn = fs.querySelector('.btn-fullscreen');
        if (btn) { btn.innerHTML = '<i data-lucide="maximize-2" style="width:14px;height:14px"></i>'; refreshIcons(); }
      }
    }
  });
}

/* ─── Chat ─── */
let _chatMessages = [];
let _chatStreaming = false;

function initChat() {
  const fab = document.getElementById('chat-fab');
  const drawer = document.getElementById('chat-drawer');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const clearBtn = document.getElementById('chat-clear');
  if (!fab || !drawer) return;

  fab.addEventListener('click', () => {
    const isOpen = !drawer.hidden;
    drawer.hidden = isOpen;
    fab.classList.toggle('open', !isOpen);
    if (!isOpen) setTimeout(() => input.focus(), 100);
  });

  sendBtn.addEventListener('click', () => sendChatMessage());

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });

  clearBtn.addEventListener('click', () => {
    _chatMessages = [];
    const container = document.getElementById('chat-messages');
    container.innerHTML = `<div class="chat-welcome">
      <i data-lucide="bot" style="width:28px;height:28px;opacity:.3"></i>
      <p>Ask me anything about QA, testing, Jira, or your workflow.</p>
    </div>`;
    refreshIcons();
  });
}

async function sendChatMessage() {
  if (_chatStreaming) return;
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  const container = document.getElementById('chat-messages');
  const welcome = container.querySelector('.chat-welcome');
  if (welcome) welcome.remove();

  _chatMessages.push({ role: 'user', content: text });
  input.value = '';
  input.style.height = 'auto';

  container.innerHTML += `<div class="chat-msg chat-msg-user">
    <div class="chat-msg-avatar"><i data-lucide="user" style="width:14px;height:14px"></i></div>
    <div class="chat-msg-bubble">${escapeAttr(text)}</div>
  </div>`;

  const botMsg = document.createElement('div');
  botMsg.className = 'chat-msg chat-msg-bot';
  botMsg.innerHTML = `<div class="chat-msg-avatar"><i data-lucide="sparkles" style="width:14px;height:14px"></i></div>
    <div class="chat-msg-bubble"><div class="chat-typing"><span class="chat-typing-dot"></span><span class="chat-typing-dot"></span><span class="chat-typing-dot"></span></div></div>`;
  container.appendChild(botMsg);
  refreshIcons();
  container.scrollTop = container.scrollHeight;

  const sendBtn = document.getElementById('chat-send');
  sendBtn.disabled = true;
  _chatStreaming = true;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: _chatMessages, model: getSelectedModel() }),
    });

    const bubble = botMsg.querySelector('.chat-msg-bubble');

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
      bubble.innerHTML = `<span style="color:var(--red)">${_esc(err.error || 'Server error')}</span>`;
      _chatMessages.pop();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value, { stream: true });
      bubble.innerHTML = marked.parse(fullText);
      container.scrollTop = container.scrollHeight;
    }

    _chatMessages.push({ role: 'assistant', content: fullText });

    if (_chatMessages.length > 40) {
      _chatMessages = _chatMessages.slice(-30);
    }

  } catch (err) {
    const bubble = botMsg.querySelector('.chat-msg-bubble');
    bubble.innerHTML = '<span style="color:var(--red)">Connection error. Try again.</span>';
  } finally {
    _chatStreaming = false;
    sendBtn.disabled = false;
    container.scrollTop = container.scrollHeight;
  }
}


/* ─── Jira Notifications ─── */
let _notifTimer = null;
let _seenNotifKeys = new Set();
let _lastNotifs = [];
let _activeNotifTab = 'new';
const NOTIF_STORAGE = 'qa-copilot-seen-notifs';
const NOTIF_HISTORY_STORAGE = 'qa-copilot-notif-history';

function _loadSeenNotifs() {
  try {
    const stored = JSON.parse(localStorage.getItem(NOTIF_STORAGE) || '{}');
    if (Array.isArray(stored) || typeof stored !== 'object') {
      _seenNotifKeys = new Set();
      localStorage.removeItem(NOTIF_STORAGE);
    } else {
      const now = Date.now();
      const maxAge = 48 * 60 * 60 * 1000;
      const fresh = {};
      for (const [k, ts] of Object.entries(stored)) {
        if (now - ts < maxAge) fresh[k] = ts;
      }
      _seenNotifKeys = new Set(Object.keys(fresh));
      localStorage.setItem(NOTIF_STORAGE, JSON.stringify(fresh));
    }
  } catch { _seenNotifKeys = new Set(); localStorage.removeItem(NOTIF_STORAGE); }
}

function _saveSeenNotifs() {
  const now = Date.now();
  const maxAge = 48 * 60 * 60 * 1000;
  const obj = {};
  try {
    const prev = JSON.parse(localStorage.getItem(NOTIF_STORAGE) || '{}');
    if (typeof prev === 'object' && !Array.isArray(prev)) Object.assign(obj, prev);
  } catch {}
  for (const k of _seenNotifKeys) { if (!obj[k]) obj[k] = now; }
  const fresh = {};
  for (const [k, ts] of Object.entries(obj)) {
    if (now - ts < maxAge) fresh[k] = ts;
  }
  const keys = Object.keys(fresh);
  if (keys.length > 300) {
    keys.sort((a, b) => fresh[a] - fresh[b]);
    keys.slice(0, keys.length - 300).forEach(k => delete fresh[k]);
  }
  _seenNotifKeys = new Set(Object.keys(fresh));
  localStorage.setItem(NOTIF_STORAGE, JSON.stringify(fresh));
}

function _saveNotifHistory(items) {
  const maxAge = 72 * 60 * 60 * 1000;
  const now = Date.now();
  let history = [];
  try { history = JSON.parse(localStorage.getItem(NOTIF_HISTORY_STORAGE) || '[]'); } catch {}
  const existingKeys = new Set(history.map(h => h.nkey));
  for (const it of items) {
    if (!existingKeys.has(it.nkey)) {
      history.push({ ...it, readAt: now });
      existingKeys.add(it.nkey);
    }
  }
  history = history.filter(h => now - h.readAt < maxAge);
  if (history.length > 100) history = history.slice(-100);
  localStorage.setItem(NOTIF_HISTORY_STORAGE, JSON.stringify(history));
}

function _getNotifHistory() {
  try { return JSON.parse(localStorage.getItem(NOTIF_HISTORY_STORAGE) || '[]'); } catch { return []; }
}

function initNotifications() {
  _loadSeenNotifs();

  const bell = document.getElementById('notif-bell');
  const dropdown = document.getElementById('notif-dropdown');

  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.contains('open');
    dropdown.classList.toggle('open');
    if (!isOpen) fetchNotifications();
  });

  dropdown.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('.notif-close');
    if (closeBtn) {
      e.preventDefault(); e.stopPropagation();
      dropdown.classList.remove('open');
      return;
    }
    const markBtn = e.target.closest('.notif-mark-read');
    if (markBtn) {
      e.stopPropagation();
      _markAllNotifRead();
      return;
    }
    const tab = e.target.closest('.notif-tab');
    if (tab) {
      e.stopPropagation();
      _switchNotifTab(tab.dataset.notifTab);
      return;
    }
    const item = e.target.closest('.notif-item');
    if (item && item.dataset.nkey) {
      e.stopPropagation();
      const key = item.dataset.issueKey || '';
      _markOneNotifRead(item);
      if (key) openInJira(key);
      return;
    }
    e.stopPropagation();
  });

  document.addEventListener('click', (e) => {
    if (dropdown.classList.contains('open') && !dropdown.contains(e.target) && !bell.contains(e.target)) {
      dropdown.classList.remove('open');
    }
  });

  const settings = getSettings();
  restartNotifPolling(settings);
}

function _switchNotifTab(tab) {
  _activeNotifTab = tab;
  const newList = document.getElementById('notif-list');
  const histList = document.getElementById('notif-history-list');
  document.querySelectorAll('.notif-tab').forEach(t => t.classList.toggle('active', t.dataset.notifTab === tab));
  if (tab === 'new') {
    newList.style.display = '';
    histList.style.display = 'none';
  } else {
    newList.style.display = 'none';
    histList.style.display = '';
    _renderNotifHistory();
  }
}

function _markOneNotifRead(itemEl) {
  const nkey = itemEl.dataset.nkey;
  const issueKey = itemEl.dataset.issueKey || '';
  const summary = itemEl.querySelector('.notif-title')?.textContent || '';
  const desc = itemEl.querySelector('.notif-desc')?.textContent || '';
  const kind = itemEl.dataset.kind || 'comment';

  _seenNotifKeys.add(nkey);
  _saveSeenNotifs();
  _saveNotifHistory([{ nkey, issueKey, summary, desc, kind }]);

  itemEl.classList.add('notif-read');
  setTimeout(() => {
    itemEl.remove();
    _updateBadgeCount();
    const list = document.getElementById('notif-list');
    if (!list.querySelector('.notif-item')) {
      list.innerHTML = '<div class="notif-empty">No new notifications</div>';
    }
  }, 300);
}

function _markAllNotifRead() {
  const items = document.querySelectorAll('#notif-list .notif-item');
  const historyItems = [];
  items.forEach(el => {
    _seenNotifKeys.add(el.dataset.nkey);
    historyItems.push({
      nkey: el.dataset.nkey,
      issueKey: el.dataset.issueKey || '',
      summary: el.querySelector('.notif-title')?.textContent || '',
      desc: el.querySelector('.notif-desc')?.textContent || '',
      kind: el.dataset.kind || 'comment',
    });
  });
  _saveSeenNotifs();
  if (historyItems.length) _saveNotifHistory(historyItems);

  document.getElementById('notif-badge').hidden = true;
  document.getElementById('notif-list').innerHTML = '<div class="notif-empty">No new notifications</div>';
}

function _updateBadgeCount() {
  const badge = document.getElementById('notif-badge');
  const count = document.querySelectorAll('#notif-list .notif-item:not(.notif-read)').length;
  if (count === 0) {
    badge.hidden = true;
  } else {
    badge.textContent = count;
    badge.hidden = false;
  }
}

function _renderNotifHistory() {
  const histList = document.getElementById('notif-history-list');

  const allItems = [];
  const seenNkeys = new Set();

  for (const n of _lastNotifs) {
    for (const ev of n.events) {
      const nkey = _notifEventKey(n.key, ev);
      if (seenNkeys.has(nkey)) continue;
      seenNkeys.add(nkey);
      const isRead = _seenNotifKeys.has(nkey);
      allItems.push({
        nkey, issueKey: n.key, kind: ev.kind,
        summary: `${n.key}: ${n.summary}`,
        desc: ev.text, time: n.updated, isRead,
      });
    }
  }

  const saved = _getNotifHistory();
  for (const h of saved) {
    if (seenNkeys.has(h.nkey)) continue;
    seenNkeys.add(h.nkey);
    allItems.push({
      nkey: h.nkey, issueKey: h.issueKey, kind: h.kind,
      summary: h.summary, desc: h.desc,
      time: new Date(h.readAt).toISOString(), isRead: true,
    });
  }

  if (allItems.length === 0) {
    histList.innerHTML = '<div class="notif-empty">No notification history</div>';
    return;
  }

  allItems.sort((a, b) => new Date(b.time) - new Date(a.time));

  let html = '';
  for (const h of allItems) {
    const iconClass = h.kind === 'assigned' ? 'notif-icon-assigned' :
                      h.kind === 'mention'  ? 'notif-icon-mention' :
                      h.kind === 'status'   ? 'notif-icon-status' :
                                                'notif-icon-comment';
    const iconName = h.kind === 'assigned' ? 'user-check' :
                     h.kind === 'mention'  ? 'at-sign' :
                     h.kind === 'status'   ? 'arrow-right-left' :
                                              'message-square';
    const timeAgo = _timeAgo(h.time);
    const readClass = h.isRead ? ' notif-item-read' : '';
    html += `
      <div class="notif-item notif-item-history${readClass}" data-issue-key="${h.issueKey}" onclick="openInJira('${h.issueKey}')">
        <div class="notif-icon-wrap ${iconClass}"><i data-lucide="${iconName}" style="width:16px;height:16px"></i></div>
        <div class="notif-body">
          <div class="notif-title">${_esc(h.summary)}</div>
          <div class="notif-desc">${_esc(h.desc)}</div>
        </div>
        <div class="notif-time">${timeAgo}</div>
      </div>`;
  }
  histList.innerHTML = html;
  refreshIcons();
}

function restartNotifPolling(settings) {
  if (_notifTimer) clearInterval(_notifTimer);
  _notifTimer = null;

  if ((settings.notifEnabled || 'on') === 'off') return;

  const interval = Math.max(15, settings.notifInterval || 60) * 1000;
  fetchNotifications();
  _notifTimer = setInterval(fetchNotifications, interval);
}

async function fetchNotifications() {
  const settings = getSettings();
  const username = settings.jiraUser || '';
  const since = 1440;

  try {
    const res = await fetch(`/api/jira/notifications?username=${encodeURIComponent(username)}&since=${since}`);
    const data = await res.json();
    _lastNotifs = data.notifications || [];
    renderNotifications(_lastNotifs);
  } catch { /* silent fail */ }
}

function _notifEventKey(issueKey, ev) {
  const textHash = ev.text.replace(/\W/g, '').substring(0, 30);
  return `${issueKey}-${ev.kind}-${textHash}`;
}

function renderNotifications(notifs) {
  const list = document.getElementById('notif-list');
  const badge = document.getElementById('notif-badge');

  let html = '';
  let count = 0;
  let firstUnseen = null;

  for (const n of notifs) {
    for (const ev of n.events) {
      const nkey = _notifEventKey(n.key, ev);
      if (_seenNotifKeys.has(nkey)) continue;

      count++;
      if (!firstUnseen) firstUnseen = { key: n.key, summary: n.summary, text: ev.text };

      const iconClass = ev.kind === 'assigned' ? 'notif-icon-assigned' :
                        ev.kind === 'mention'  ? 'notif-icon-mention' :
                        ev.kind === 'status'   ? 'notif-icon-status' :
                                                  'notif-icon-comment';
      const iconName = ev.kind === 'assigned' ? 'user-check' :
                       ev.kind === 'mention'  ? 'at-sign' :
                       ev.kind === 'status'   ? 'arrow-right-left' :
                                                'message-square';
      const timeAgo = _timeAgo(n.updated);
      html += `
        <div class="notif-item" data-nkey="${nkey}" data-issue-key="${n.key}" data-kind="${ev.kind}">
          <div class="notif-icon-wrap ${iconClass}"><i data-lucide="${iconName}" style="width:16px;height:16px"></i></div>
          <div class="notif-body">
            <div class="notif-title">${n.key}: ${_esc(n.summary)}</div>
            <div class="notif-desc">${_esc(ev.text)}</div>
          </div>
          <div class="notif-time">${timeAgo}</div>
        </div>`;
    }
  }

  if (count === 0) {
    badge.hidden = true;
    list.innerHTML = '<div class="notif-empty">No new notifications</div>';
    return;
  }

  badge.textContent = count;
  badge.hidden = false;
  list.innerHTML = html;
  refreshIcons();

  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
  if (firstUnseen && Notification.permission === 'granted') {
    new Notification(`${firstUnseen.key}: ${firstUnseen.summary}`, {
      body: firstUnseen.text, icon: '/favicon.ico',
    });
  }
}

function _timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

function _esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function getJiraBaseUrl() {
  const s = getSettings();
  return s.jiraUrl || _jiraBaseUrl || '';
}

function openInJira(key) {
  const base = getJiraBaseUrl();
  if (!base) { showToast('Jira URL not configured. Set it in Settings or .env', 'error'); return; }
  window.open(`${base}/browse/${key}`, '_blank');
}

function openNotifIssue(key) {
  openInJira(key);
}
