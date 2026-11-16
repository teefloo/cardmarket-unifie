const enabledToggle = document.getElementById('enabled');
const popupStatus = document.getElementById('popupStatus');
let enabled = CardmarketSettings.DEFAULTS.enabled;

CardmarketSettings.loadSettings(chrome.storage.local).then((settings) => {
  enabled = settings.enabled;
  enabledToggle.checked = enabled;
}).catch(() => {
  popupStatus.textContent = 'Impossible de charger les réglages.';
});

enabledToggle.addEventListener('change', async () => {
  const previous = enabled;
  enabled = enabledToggle.checked;
  try {
    await chrome.storage.local.set({ enabled });
    popupStatus.textContent = enabled ? 'Extension activée.' : 'Extension désactivée.';
  } catch {
    enabled = previous;
    enabledToggle.checked = enabled;
    popupStatus.textContent = 'Impossible d’enregistrer ce réglage.';
  }
});
