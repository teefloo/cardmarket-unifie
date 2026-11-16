const HISTORY_ORIGIN = 'https://charts.matrastcg.de';
const CARDMARKET_HOSTS = new Set(['www.cardmarket.com', 'cardmarket.com']);

function isPokemonSinglesSender(sender) {
  if (sender?.frameId !== 0) return false;
  try {
    const page = new URL(sender?.url || '');
    return CARDMARKET_HOSTS.has(page.hostname.toLowerCase())
      && /^\/(?:[a-z]{2}\/)?Pokemon\/Products\/Singles\/[^/]+\/[^/]+$/i.test(page.pathname);
  } catch { return false; }
}

function isValidHistoryRequest(message) {
  if (!message || Object.keys(message).some((key) => !['type', 'url'].includes(key))) return null;
  let url;
  try { url = new URL(message.url); }
  catch { return null; }
  const key = url.searchParams.get('key') || '';
  const parameterNames = [...url.searchParams.keys()];
  const valid = url.origin === HISTORY_ORIGIN
    && !url.hash
    && !url.username
    && !url.password
    && url.pathname === '/api/v1/verlauf'
    && parameterNames.length === 3
    && new Set(parameterNames).size === 3
    && parameterNames.every((name) => ['spiel', 'id', 'key'].includes(name))
    && url.searchParams.get('spiel') === '6'
    && Number.isSafeInteger(Number(url.searchParams.get('id')))
    && Number(url.searchParams.get('id')) > 0
    && /^\/Pokemon\/Products\/Singles\/[^/]+\/[^/]+$/i.test(key)
    && !/[\u0000-\u001f]/.test(key);
  return valid ? url : null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'service-request') return;
  const url = isValidHistoryRequest(message);
  if (!url || !isPokemonSinglesSender(sender)) {
    sendResponse({ error: 'Requête d’historique refusée.' });
    return;
  }

  chrome.permissions.contains({ origins: [`${HISTORY_ORIGIN}/*`] }).then(async (allowed) => {
    if (!allowed) {
      sendResponse({ error: 'Autorisation du service d’historique manquante.' });
      return;
    }
    try {
      const response = await fetch(url, { credentials: 'omit', cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      sendResponse({ data: await response.json() });
    } catch {
      sendResponse({ error: 'Service d’historique indisponible.' });
    }
  }).catch(() => sendResponse({ error: 'Vérification de l’autorisation impossible.' }));
  return true;
});

if (typeof module !== 'undefined' && module.exports) module.exports = { isPokemonSinglesSender, isValidHistoryRequest };
