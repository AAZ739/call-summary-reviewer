
/*
 * Evidence-led QA review workspace.
 * Findings and decisions are made by the reviewer and saved locally.
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'call-review-qa-v1';

  const STATUS_LABELS = {
    'unreviewed': 'Not reviewed',
    'acceptable': 'Acceptable',
    'needs-correction': 'Needs correction',
    'uncertain': 'Uncertain'
  };

  const ISSUE_LABELS = {
    contradiction: 'Contradiction',
    unsupported: 'Unsupported claim',
    omission: 'Required omission',
    'rule-breach': 'Rule breach'
  };

  const $ = id => document.getElementById(id);

  const escapeHtml = value => String(value ?? '').replace(
    /[&<>"']/g,
    char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char])
  );

  const newReview = () => ({
    status: 'unreviewed',
    notes: '',
    findings: [],
    correctedSummary: ''
  });

  let calls = [];
  let reviews = {};
  let currentId = null;
  let selectedTurns = new Set();
  let toastTimeout;
  let editingIndex = null;
  let lastDeletedFinding = null;

  function readReviews() {
    try {
      const saved = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || '{}'
      );
      return saved && typeof saved === 'object' && !Array.isArray(saved)
        ? saved
        : {};
    } catch {
      return {};
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
      $('saved-label').textContent = 'Saved in this browser';
    } catch {
      $('saved-label').textContent =
        'Storage unavailable — export your report';
    }
    updateMetrics();
  }

  function reviewFor(id) {
    if (!reviews[id]) reviews[id] = newReview();
    return reviews[id];
  }

  function showToast(message) {
    const el = $('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      el.hidden = true;
    }, 2700);
  }

  function currentCall() {
    return calls.find(call => call.id === currentId);
  }

  function filteredCalls() {
    const query = $('call-search').value.trim().toLowerCase();
    const filter = $('status-filter').value;

    return calls.filter(call =>
      call.id.toLowerCase().includes(query) &&
      (filter === 'all' || reviewFor(call.id).status === filter)
    );
  }

  function updateMetrics() {
    const count = status =>
      calls.filter(call => reviewFor(call.id).status === status).length;

    const reviewed = calls.length - count('unreviewed');

    $('progress-label').textContent = `${reviewed} / ${calls.length}`;
    $('progress-bar').style.width =
      `${calls.length ? reviewed / calls.length * 100 : 0}%`;

    $('approved-count').textContent = count('acceptable');
    $('correction-count').textContent = count('needs-correction');
    $('uncertain-count').textContent = count('uncertain');

    renderCallList();
  }

  function renderCallList() {
    const shown = filteredCalls();
    $('filter-count').textContent = `${shown.length} shown`;

    $('call-list').innerHTML = shown.map(call => {
      const status = reviewFor(call.id).status;
      const cls = status === 'acceptable'
        ? 'good'
        : status === 'needs-correction'
          ? 'bad'
          : status === 'uncertain'
            ? 'unclear'
            : '';

      const symbol = status === 'unreviewed'
        ? '○'
        : status === 'acceptable'
          ? '✓'
          : status === 'needs-correction'
            ? '!'
            : '?';

      const label = status === 'unreviewed'
        ? 'Pending'
        : status === 'acceptable'
          ? 'Done'
          : status === 'needs-correction'
            ? 'Fix'
            : 'Check';

      return `
        <button type="button"
          class="call-entry ${currentId === call.id ? 'active' : ''}"
          data-call-id="${escapeHtml(call.id)}"
          aria-current="${currentId === call.id}">
          <div>
            <strong>${escapeHtml(call.id)}</strong>
            <span>${escapeHtml(call.call_date)}</span>
          </div>
          <span class="entry-status ${cls}">
            ${symbol} ${label}
          </span>
        </button>
      `;
    }).join('') ||
      '<p class="side-description">No calls match this filter.</p>';
  }

  function parseTurns(transcript) {
    return String(transcript || '')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line, index) => {
        const match = line.match(
          /^(T\d+)\s+\[([^\]]+)\]\s+([^:]+):\s*([\s\S]*)$/
        );

        if (match) {
          return {
            id: match[1],
            time: match[2],
            speaker: match[3].trim(),
            text: match[4]
          };
        }

        return {
          id: `T${String(index + 1).padStart(2, '0')}`,
          time: '',
          speaker: 'Unknown',
          text: line
        };
      });
  }

  function renderTranscript(call) {
    const turns = parseTurns(call.transcript);
    $('turn-count').textContent = `${turns.length} turns`;

    $('transcript').innerHTML = turns.map(turn => {
      const role = /^agent\b/i.test(turn.speaker)
        ? 'agent'
        : /^customer\b/i.test(turn.speaker)
          ? 'customer'
          : 'other';

      return `
        <button type="button"
          class="turn ${selectedTurns.has(turn.id) ? 'selected' : ''}"
          data-turn-id="${escapeHtml(turn.id)}"
          aria-pressed="${selectedTurns.has(turn.id)}">
          <span class="turn-ref">
            <strong>${escapeHtml(turn.id)}</strong>
            <time>${escapeHtml(turn.time)}</time>
          </span>
          <span class="turn-copy">
            <span class="speaker ${role}">
              ${escapeHtml(turn.speaker)}
            </span>
            ${escapeHtml(turn.text)}
          </span>
        </button>
      `;
    }).join('');
  }

  function renderFindings(review) {
    $('finding-count').textContent = String(review.findings.length);

    if (!review.findings.length) {
      $('findings-list').innerHTML = `
        <div class="empty-findings">
          No findings added. This may be appropriate if the summary
          accurately follows the transcript and rules.
        </div>
      `;
      return;
    }

    $('findings-list').innerHTML = review.findings.map(
      (item, index) => `
        <article class="finding-item ${escapeHtml(item.severity)}">
          <div class="finding-top">
            <div>
              <strong>
                ${escapeHtml(ISSUE_LABELS[item.type] || item.type)}
              </strong>
              <span>· ${escapeHtml(item.severity)} impact</span>
            </div>
            <div>
              <button type="button"
                class="remove-finding"
                data-edit-index="${index}">
                Edit
              </button>
              <button type="button"
                class="remove-finding"
                data-remove-index="${index}">
                Remove
              </button>
            </div>
          </div>
          <p>${escapeHtml(item.description)}</p>
          <div class="finding-foot">
            <b>Evidence:</b>
            ${escapeHtml(item.evidence || 'Not specified')}
            ${item.fix ? `
              <span>
                · <b>Correction:</b> ${escapeHtml(item.fix)}
              </span>
            ` : ''}
          </div>
        </article>
      `
    ).join('');
  }

  function displayHeuristic(call) {
    $('heuristic-banner').hidden = true;
  }

  function selectCall(id) {
    const call = calls.find(item => item.id === id);
    if (!call) return;

    currentId = id;
    selectedTurns = new Set();

    const review = reviewFor(id);

    $('call-id').textContent = call.id;
    $('call-meta').textContent =
      `${call.call_date}  •  Estimated duration ${call.estimated_duration}`;
    $('summary-text').textContent = call.summary;

    $('current-status').textContent =
      STATUS_LABELS[review.status] || STATUS_LABELS.unreviewed;
    $('current-status').className =
      `status-badge ${review.status}`;

    document.querySelectorAll('[data-status]').forEach(button => {
      const active = button.dataset.status === review.status;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    $('review-notes').value = review.notes || '';
    $('corrected-summary').value = review.correctedSummary || '';

    editingIndex = null;
    $('finding-form').reset();
    $('evidence-ids').value = '';
    $('finding-form').querySelector('[type=submit]').textContent =
      'Add finding';

    renderTranscript(call);
    renderFindings(review);
    displayHeuristic(call);

    const index = calls.findIndex(call => call.id === currentId);
    $('prev-btn').disabled = index <= 0;
    $('next-btn').disabled = index >= calls.length - 1;

    renderCallList();
  }

  function validateReview() {
    if (!currentId) return;
  
    const review = reviewFor(currentId);
  
    if (review.status === 'needs-correction' &&
        review.findings.length === 0) {
      showToast(
        'Review warning: Needs correction has no recorded findings.'
      );
    } else if (
      review.status === 'acceptable' &&
      review.findings.length > 0
    ) {
      showToast(
        'Review warning: Acceptable has existing findings. Please verify.'
      );
    }
  }
  
  // Clicking the active decision again resets it to Not reviewed.
  function setStatus(status) {
    if (!currentId || !Object.hasOwn(STATUS_LABELS, status)) return;

    const review = reviewFor(currentId);
    review.status =
      review.status === status ? 'unreviewed' : status;

    persist();
    selectCall(currentId);
    validateReview();
  }

  function addFinding(event) {
    event.preventDefault();
    if (!currentId) return;

    const description = $('finding-description').value.trim();
    if (!description) {
      return showToast('Please describe the issue first.');
    }

    const turns = parseTurns(currentCall().transcript);
    const rawEvidence = $('evidence-ids').value.trim();

    const ids = [
      ...new Set(
        (rawEvidence.match(/T\d+/gi) || [])
          .map(id => id.toUpperCase())
      )
    ];

    const valid = new Set(turns.map(turn => turn.id));
    const invalid = ids.filter(id => !valid.has(id));

    if (rawEvidence && (invalid.length || ids.length === 0)) {
      showToast(
        `Check turn IDs: ${invalid.join(', ') || rawEvidence}`
      );
      return;
    }

    const finding = {
      type: $('finding-type').value,
      severity: $('finding-severity').value,
      description,
      evidence: ids.join(', '),
      fix: $('finding-fix').value.trim()
    };

    const review = reviewFor(currentId);
    const wasEditing = editingIndex !== null;

    if (wasEditing) {
      review.findings[editingIndex] = finding;
    } else {
      review.findings.push(finding);
    }

    persist();
    selectCall(currentId);

    showToast(
      wasEditing
        ? 'Finding updated.'
        : 'Finding added with its evidence.'
    );
  }

  function exportReviews() {
    const records = calls.map(call => ({
      call_id: call.id,
      ...JSON.parse(JSON.stringify(reviewFor(call.id)))
    }));

    const result = {
      project: 'Call Summary QA Review',
      generated_at: new Date().toISOString(),
      scope: '20 synthetic calls; transcript used as reference',
      methodology:
        'Human-reviewed evidence; automated prompts are non-authoritative',
      records
    };

    const blob = new Blob(
      [JSON.stringify(result, null, 2)],
      { type: 'application/json' }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'qa-review-report.json';
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('QA report exported.');
  }

  async function init() {
    try {
      const [callResponse, ruleResponse] = await Promise.all([
        fetch('./data/candidate-calls.json'),
        fetch('./data/summary-rules.txt')
      ]);

      if (!callResponse.ok || !ruleResponse.ok) {
        throw new Error('Unable to load one or more data files.');
      }

      const loaded = await callResponse.json();

      if (
        !Array.isArray(loaded) ||
        !loaded.length ||
        !loaded.every(call =>
          call.id &&
          typeof call.transcript === 'string' &&
          typeof call.summary === 'string'
        )
      ) {
        throw new Error('Call data format is invalid.');
      }

      calls = loaded;
      reviews = readReviews();

      $('rules-text').textContent = await ruleResponse.text();

      $('loading').hidden = true;
      $('app-content').hidden = false;

      updateMetrics();
      selectCall(calls[0].id);
    } catch (error) {
      $('loading').textContent =
        `Could not load calls: ${error.message} ` +
        'Start a local HTTP server ' +
        '(e.g. python3 -m http.server 8080) ' +
        'rather than opening index.html directly.';
    }
  }

  $('call-list').addEventListener('click', event => {
    const target = event.target.closest('[data-call-id]');
    if (target) selectCall(target.dataset.callId);
  });

  $('transcript').addEventListener('click', event => {
    const turn = event.target.closest('[data-turn-id]');
    if (!turn) return;

    const id = turn.dataset.turnId;

    if (selectedTurns.has(id)) {
      selectedTurns.delete(id);
    } else {
      selectedTurns.add(id);
    }

    const turnOrder = parseTurns(currentCall().transcript)
      .map(turn => turn.id);

    $('evidence-ids').value = [...selectedTurns]
      .sort((a, b) =>
        turnOrder.indexOf(a) - turnOrder.indexOf(b)
      )
      .join(', ');

    turn.classList.toggle(
      'selected',
      selectedTurns.has(id)
    );

    turn.setAttribute(
      'aria-pressed',
      String(selectedTurns.has(id))
    );
  });

  // Existing findings can now be edited or removed.
  $('findings-list').addEventListener('click', event => {
    if (!currentId) return;

    const edit = event.target.closest('[data-edit-index]');

    if (edit) {
      editingIndex = Number(edit.dataset.editIndex);
      const item = reviewFor(currentId).findings[editingIndex];
      if (!item) return;

      $('finding-type').value = item.type;
      $('finding-severity').value = item.severity;
      $('finding-description').value = item.description;
      $('evidence-ids').value = item.evidence || '';
      $('finding-fix').value = item.fix || '';

      
      selectedTurns = new Set(
        (item.evidence || '').match(/T\d+/g) || []
      );

      renderTranscript(currentCall());

      $('finding-form')
        .querySelector('[type=submit]')
        .textContent = 'Save changes';

      $('finding-form').scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });

      return;
    }

    // Handle finding deletion.
    const target = event.target.closest('[data-remove-index]');
    if (!target) return;

    const index = Number(target.dataset.removeIndex);
    const review = reviewFor(currentId);

    // Store the deleted finding for Undo.
    const deleted = review.findings.splice(index, 1)[0];

    if (!deleted) return;

    lastDeletedFinding = {
      callId: currentId,
      index,
      finding: deleted
    };

    if (editingIndex === index) {
      editingIndex = null;
      $('finding-form').reset();
      $('finding-form')
        .querySelector('[type=submit]')
        .textContent = 'Add finding';
    } else if (
      editingIndex !== null &&
      editingIndex > index
    ) {
      editingIndex--;
    }

    persist();
    renderFindings(review);

    // Create the Undo button.
    const undoButton = document.createElement('button');
    undoButton.type = 'button';
    undoButton.textContent = '↶ Undo last deletion';
    undoButton.className = 'remove-finding';
    undoButton.style.marginTop = '12px';

    undoButton.addEventListener('click', () => {
      if (!lastDeletedFinding) return;

      const { callId, index, finding } = lastDeletedFinding;

      reviewFor(callId).findings.splice(index, 0, finding);
      lastDeletedFinding = null;

      persist();

      if (currentId === callId) {
        renderFindings(reviewFor(callId));
      }

      showToast('Deleted finding restored.');
    });

    $('findings-list').appendChild(undoButton);
  });

  // Review outcome buttons.
  document.querySelectorAll('[data-status]').forEach(button => {
    button.addEventListener(
      'click',
      () => setStatus(button.dataset.status)
    );
  });

  // Finding submission.
  $('finding-form').addEventListener('submit', addFinding);

  // Save review notes.
  $('review-notes').addEventListener('input', event => {
    if (currentId) {
      reviewFor(currentId).notes = event.target.value;
      persist();
    }
  });

  // Save corrected summaries.
  $('corrected-summary').addEventListener('input', event => {
    if (currentId) {
      reviewFor(currentId).correctedSummary = event.target.value;
      persist();
    }
  });

  // Call filtering.
  $('status-filter').addEventListener('change', renderCallList);
  $('call-search').addEventListener('input', renderCallList);

  // Previous call navigation.
  $('prev-btn').addEventListener('click', () => {
    const index = calls.findIndex(call => call.id === currentId);

    if (index > 0) {
      selectCall(calls[index - 1].id);
    }
  });

  // Next call navigation.
  $('next-btn').addEventListener('click', () => {
    const index = calls.findIndex(call => call.id === currentId);

    if (index < calls.length - 1) {
      selectCall(calls[index + 1].id);
    }
  });

  // Export QA reviews.
  $('export-btn').addEventListener('click', exportReviews);

  // Open summary rules.
  $('rules-btn').addEventListener('click', () => {
    $('rules-dialog').showModal();
  });

  // Close summary rules.
  $('close-rules').addEventListener('click', () => {
    $('rules-dialog').close();
  });

  $('rules-dialog').addEventListener('click', event => {
    if (event.target === $('rules-dialog')) {
      $('rules-dialog').close();
    }
  });

  // Copy corrected summary.
  $('copy-correction').addEventListener('click', async () => {
    const value = $('corrected-summary').value.trim();

    if (!value) {
      showToast('Enter a corrected summary first.');
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      showToast('Corrected summary copied.');
    } catch {
      showToast('Clipboard blocked; select the text to copy.');
    }
  });

  // Initialise application.
  init();
})();
