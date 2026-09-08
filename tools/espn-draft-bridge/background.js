const LOCAL_BASES = ['http://127.0.0.1:5000', 'http://localhost:5000'];

async function requestLocal(path, init = {}) {
  let lastError = null;
  for (const base of LOCAL_BASES) {
    try {
      const response = await fetch(`${base}${path}`, {
        ...init,
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init.headers || {}),
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || `TIBER bridge returned HTTP ${response.status}`);
      }
      return payload;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('TIBER Command Center is not reachable on localhost:5000.');
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (!message || typeof message !== 'object') return { ok: false, error: 'invalid_message' };

    if (message.type === 'tiber:heartbeat') {
      const payload = await requestLocal('/api/management/espn-draft-bridge/heartbeat', {
        method: 'POST',
        body: JSON.stringify(message.payload || {}),
      });
      return { ok: true, payload };
    }

    if (message.type === 'tiber:poll') {
      const pageInstanceId = encodeURIComponent(String(message.pageInstanceId || ''));
      const payload = await requestLocal(`/api/management/espn-draft-bridge/next?page_instance_id=${pageInstanceId}`);
      return { ok: true, payload };
    }

    if (message.type === 'tiber:result') {
      const payload = await requestLocal('/api/management/espn-draft-bridge/result', {
        method: 'POST',
        body: JSON.stringify(message.payload || {}),
      });
      return { ok: true, payload };
    }

    return { ok: false, error: 'unsupported_message' };
  })()
    .then(sendResponse)
    .catch((error) => sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));

  return true;
});
