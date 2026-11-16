(function (root) {
  const CHALLENGE_MARKERS = [
    '#challenge-form',
    '#cf-challenge-running',
    '#cf-challenge-stage',
    '#cf-spinner-please-wait',
    '.cf-browser-verification',
    '.cf-turnstile',
    'iframe[src*="challenges.cloudflare.com"]',
  ].join(',');

  function isCloudflareChallenge(documentRef = root.document) {
    if (!documentRef) return false;
    if (documentRef.querySelector?.(CHALLENGE_MARKERS)) return true;

    const title = String(documentRef.title || '');
    const bodyText = String(documentRef.body?.innerText || documentRef.body?.textContent || '').slice(0, 2500);
    const text = `${title}\n${bodyText}`;
    const challengeCopy = /just a moment|checking your browser|performing security verification|verify (?:that )?you are human/i.test(text);
    const cloudflareCopy = /cloudflare|cf-ray|security verification/i.test(text);
    return challengeCopy && cloudflareCopy;
  }

  function isSupportedCardmarketPage(urlValue = root.location?.href, settingsApi = root.CardmarketSettings) {
    let url;
    try { url = new URL(urlValue, 'https://www.cardmarket.com'); }
    catch { return false; }
    if (!['www.cardmarket.com', 'cardmarket.com'].includes(url.hostname.toLowerCase())) return false;
    if (settingsApi?.isPokemonPath) return settingsApi.isPokemonPath(url.pathname);
    return /^\/(?:[a-z]{2}\/)?Pokemon\/Products\//i.test(url.pathname);
  }

  function createRuntime({
    documentRef = root.document,
    locationRef = root.location,
    MutationObserverClass = root.MutationObserver,
    settingsApi = root.CardmarketSettings,
  } = {}) {
    function runWhenReady(callback) {
      if (typeof callback !== 'function' || !isSupportedCardmarketPage(locationRef?.href, settingsApi)) return false;
      if (!isCloudflareChallenge(documentRef)) {
        callback();
        return true;
      }
      if (typeof MutationObserverClass !== 'function') return false;

      let observer;
      let ran = false;
      const check = () => {
        if (ran || isCloudflareChallenge(documentRef)) return;
        ran = true;
        observer?.disconnect();
        callback();
      };
      observer = new MutationObserverClass(check);
      observer.observe(documentRef.documentElement || documentRef, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
      return true;
    }

    return { runWhenReady };
  }

  const runtime = {
    CHALLENGE_MARKERS,
    isCloudflareChallenge,
    isSupportedCardmarketPage,
    createRuntime,
    runWhenReady(callback) { return createRuntime().runWhenReady(callback); },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = runtime;
  root.CardmarketRuntime = runtime;
})(typeof globalThis !== 'undefined' ? globalThis : this);
