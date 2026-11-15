function renderTotals(state) {
  document.querySelector('#session strong').textContent = `${state.sessionCount} calcul${state.sessionCount === 1 ? '' : 's'} · ${(state.sessionValue || 0).toFixed(2).replace('.', ',')} €`;
}

let popupSettings = { ...CardmarketSettings.DEFAULTS };
CardmarketSettings.loadSettings(chrome.storage.local).then((settings) => {
  popupSettings = settings;
  document.getElementById('enabled').checked = settings.enabled;
  document.getElementById('sessionSection').hidden = !CardmarketSettings.isFeatureEnabled(settings, 'showSessionTotal');
  renderTotals({ sessionCount: settings.sessionCount || 0, sessionValue: settings.sessionValue || 0 });
}).catch(() => {});
document.getElementById('enabled').addEventListener('change', (event) => {
  popupSettings = { ...popupSettings, enabled: event.target.checked };
  void chrome.storage.local.set({ enabled: popupSettings.enabled });
  document.getElementById('sessionSection').hidden = !CardmarketSettings.isFeatureEnabled(popupSettings, 'showSessionTotal');
});
document.getElementById('resetSession').addEventListener('click', async () => {
  const totals = { sessionCount: 0, sessionValue: 0 };
  await chrome.storage.local.set(totals);
  renderTotals(totals);
});
