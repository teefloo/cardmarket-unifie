const HISTORY_ORIGINS = ['https://charts.matrastcg.de/*'];
let settings = { ...CardmarketSettings.DEFAULTS };
let saveQueue = Promise.resolve();

function setStatus(message, state = '') {
  const output = document.getElementById('saved');
  output.textContent = message;
  output.dataset.state = state;
}

function readForm() {
  return CardmarketSettings.migrateSettings({
    enabled: settings.enabled,
    preferredLanguage: document.getElementById('preferredLanguage').value,
    showConditionPrices: document.getElementById('showConditionPrices').checked,
    showHistoricalChart: document.getElementById('showHistoricalChart').checked,
  });
}

function save() {
  settings = readForm();
  setStatus('Enregistrement…');
  const values = Object.fromEntries(Object.keys(CardmarketSettings.DEFAULTS).map((key) => [key, settings[key]]));
  saveQueue = saveQueue.then(() => chrome.storage.local.set(values)).then(() => {
    setStatus('Enregistré', 'saved');
  }).catch(() => setStatus('Échec de l’enregistrement', 'error'));
  return saveQueue;
}

async function refreshHistoryPermission() {
  const granted = await chrome.permissions.contains({ origins: HISTORY_ORIGINS });
  document.getElementById('historyPermissionStatus').textContent = granted ? 'Autorisé' : 'Non autorisé';
  document.getElementById('historyPermissionButton').textContent = granted ? 'Retirer l’accès' : 'Autoriser l’accès';
}

async function initialize() {
  try {
    settings = await CardmarketSettings.loadSettings(chrome.storage.local);
    document.getElementById('preferredLanguage').value = settings.preferredLanguage;
    document.getElementById('showConditionPrices').checked = settings.showConditionPrices;
    document.getElementById('showHistoricalChart').checked = settings.showHistoricalChart;
    for (const id of ['preferredLanguage', 'showConditionPrices', 'showHistoricalChart']) {
      document.getElementById(id).addEventListener('change', save);
    }
    document.getElementById('historyPermissionButton').addEventListener('click', async () => {
      const button = document.getElementById('historyPermissionButton');
      button.disabled = true;
      try {
        const currentlyGranted = await chrome.permissions.contains({ origins: HISTORY_ORIGINS });
        const changed = currentlyGranted
          ? await chrome.permissions.remove({ origins: HISTORY_ORIGINS })
          : await chrome.permissions.request({ origins: HISTORY_ORIGINS });
        setStatus(changed ? 'Accès au service mis à jour' : 'Aucune modification des autorisations', changed ? 'saved' : '');
        await refreshHistoryPermission();
      } catch {
        setStatus('Impossible de modifier cette autorisation', 'error');
      } finally {
        button.disabled = false;
      }
    });
    setStatus('Réglages chargés', 'saved');
    await refreshHistoryPermission();
  } catch {
    setStatus('Impossible de charger les réglages', 'error');
  }
}

initialize();
