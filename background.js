importScripts('core.js');

const ALLOWED_SERVICES = new Set([
  'https://charts.matrastcg.de',
  'https://api-cardmarket.mave.me',
  'https://help.cardmarket.com',
]);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'shipping-estimate') {
    const allowedKeys = new Set(['type', 'fromCountry', 'toCountry', 'locale']);
    if (Object.keys(message).some((key) => !allowedKeys.has(key))) {
      sendResponse({ error: 'Requête refusée.' });
      return;
    }
    const url = CardmarketCore.buildShippingCostsUrl(message.fromCountry, message.toCountry, message.locale);
    if (!url) {
      sendResponse({ error: 'Requête refusée.' });
      return;
    }
    chrome.permissions.contains({ origins: ['https://help.cardmarket.com/*'] }).then(async (allowed) => {
      if (!allowed) {
        sendResponse({ error: 'Autorisation réseau manquante. Active-la dans les options.' });
        return;
      }
      try {
        const response = await fetch(url, { credentials: 'omit' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        sendResponse({ data: await response.json() });
      } catch (error) {
        sendResponse({ error: error.message });
      }
    }).catch(() => {
      sendResponse({ error: 'Vérification de permission impossible.' });
    });
    return true;
  }
  if (message?.type !== 'service-request') return;

  let url;
  try {
    url = new URL(message.url);
  } catch {
    sendResponse({ error: 'Adresse de service invalide.' });
    return;
  }
  if (!ALLOWED_SERVICES.has(url.origin)) {
    sendResponse({ error: 'Service non autorisé.' });
    return;
  }

  const isMatrasRead = url.origin === 'https://charts.matrastcg.de'
    && url.pathname === '/api/v1/verlauf'
    && ['1', '3', '6', '18', '19', '22'].includes(url.searchParams.get('spiel'))
    && Number.isSafeInteger(Number(url.searchParams.get('id')))
    && Number(url.searchParams.get('id')) > 0
    && /^\/(?:Magic|YuGiOh|Pokemon|OnePiece|Lorcana|Riftbound)\/Products\/Singles\/[^/]+\/[^/]+$/i.test(url.searchParams.get('key') || '')
    && !/[\u0000-\u001f]/.test(url.searchParams.get('key') || '');
  const isMaveChart = url.origin === 'https://api-cardmarket.mave.me'
    && url.pathname === '/chart'
    && message.method === 'POST'
    && CardmarketCore.validateMaveRequest(message.cardKey, message.payload, message.headers);
  if (!isMatrasRead && !isMaveChart) {
    sendResponse({ error: 'Requête refusée.' });
    return;
  }

  chrome.permissions.contains({ origins: [`${url.origin}/*`] }).then(async (allowed) => {
    if (!allowed) {
      sendResponse({ error: 'Autorisation réseau manquante. Active-la dans les options.' });
      return;
    }

    try {
      const options = isMaveChart
        ? {
          method: 'POST',
          credentials: 'omit',
          headers: {
            'Content-Type': 'application/json',
            'X-Idempotency-Key': message.headers['X-Idempotency-Key'],
            Expires: message.headers.Expires,
          },
          body: JSON.stringify(message.payload),
        }
        : { credentials: 'omit' };
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (isMaveChart) sendResponse({ success: true });
      else sendResponse({ data: await response.json() });
    } catch (error) {
      sendResponse({ error: error.message });
    }
  }).catch(() => {
    sendResponse({ error: 'Vérification de permission impossible.' });
  });
  return true;
});
