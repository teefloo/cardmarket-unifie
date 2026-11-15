const settingKeys = Object.keys(CardmarketSettings.DEFAULTS);
let currentSettings = { ...CardmarketSettings.DEFAULTS };
let saveQueue = Promise.resolve();

function setStatus(message, state = '') {
  const output = document.getElementById('saved');
  output.textContent = message;
  output.dataset.state = state;
}

function readForm() {
  const values = { ...currentSettings };
  for (const key of settingKeys) {
    if (key === 'favoriteGames') {
      values.favoriteGames = [...document.querySelectorAll('.cmu-game:checked')].map((game) => game.value);
      continue;
    }
    if (key === 'offerLanguages') {
      values.offerLanguages = [...document.querySelectorAll('input[name="offerLanguages"]:checked')].map((input) => input.value);
      continue;
    }
    if (key === 'priceShortcuts') {
      values.priceShortcuts = [...document.querySelectorAll('input[name="priceShortcuts"]:checked')].map((input) => input.value);
      continue;
    }
    const input = document.getElementById(key);
    if (!input) continue;
    if (input.type === 'checkbox') values[key] = input.checked;
    else if (input.type === 'number') {
      const number = Number(input.value);
      values[key] = Number.isFinite(number) ? number : CardmarketSettings.DEFAULTS[key];
    } else if (key === 'commentTemplates') {
      values[key] = input.value.split('\n').map((line) => line.trim()).filter(Boolean);
    } else values[key] = input.value;
  }
  return CardmarketSettings.migrateSettings(values);
}

function save() {
  currentSettings = readForm();
  setStatus('Enregistrement…');
  const toStore = Object.fromEntries(settingKeys.map((key) => [key, currentSettings[key]]));
  saveQueue = saveQueue.then(() => chrome.storage.local.set(toStore)).then(() => {
    const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date());
    setStatus(`Enregistré à ${time}`, 'saved');
  }).catch(() => setStatus('Échec de l’enregistrement', 'error'));
  return saveQueue;
}

function bindForm(settings) {
  currentSettings = settings;
  for (const key of settingKeys) {
    if (key === 'favoriteGames') {
      document.querySelectorAll('.cmu-game').forEach((game) => {
        game.checked = settings.favoriteGames.includes(game.value);
        game.addEventListener('change', save);
      });
      continue;
    }
    if (key === 'offerLanguages') {
      const inputs = [...document.querySelectorAll('input[name="offerLanguages"]')];
      const allInput = document.getElementById('offerLanguageAll');
      inputs.forEach((input) => {
        input.checked = settings.offerLanguages.includes(input.value);
        input.addEventListener('change', () => {
          allInput.checked = !inputs.some((languageInput) => languageInput.checked);
          save();
        });
      });
      allInput.checked = settings.offerLanguages.length === 0;
      allInput.addEventListener('change', () => {
        if (allInput.checked) inputs.forEach((input) => { input.checked = false; });
        else if (!inputs.some((input) => input.checked)) allInput.checked = true;
        save();
      });
      continue;
    }
    if (key === 'priceShortcuts') {
      document.querySelectorAll('input[name="priceShortcuts"]').forEach((input) => {
        input.checked = settings.priceShortcuts.includes(input.value);
        input.addEventListener('change', save);
      });
      continue;
    }
    const input = document.getElementById(key);
    if (!input) continue;
    if (input.type === 'checkbox') input.checked = settings[key] === true;
    else if (key === 'commentTemplates') input.value = settings[key].join('\n');
    else input.value = settings[key];
    input.addEventListener('change', save);
    if (input.tagName === 'TEXTAREA') input.addEventListener('input', save);
  }
}

const permissions = {
  matras: { origins: ['https://charts.matrastcg.de/*'], statusId: 'matrasStatus', buttonId: 'matrasPermission', label: 'Matras' },
  shipping: { origins: ['https://help.cardmarket.com/*'], statusId: 'shippingStatus', buttonId: 'shippingPermission', label: 'tarifs d’envoi Cardmarket' },
  mave: { origins: ['https://api-cardmarket.mave.me/*'], statusId: 'maveStatus', buttonId: 'mavePermission', label: 'Mave' },
  partner: { origins: ['https://kaiofcards.com/*', 'https://www.despelvogel.com/*', 'https://zycards.nl/*'], statusId: 'partnerStatus', buttonId: 'partnerPermission', label: 'boutiques partenaires' },
};

async function refreshPermissionStatus() {
  for (const permission of Object.values(permissions)) {
    const granted = await chrome.permissions.contains({ origins: permission.origins });
    document.getElementById(permission.statusId).textContent = granted ? 'Autorisé' : 'Non autorisé';
  }
}

function bindPermissionButtons() {
  for (const permission of Object.values(permissions)) {
    document.getElementById(permission.buttonId).addEventListener('click', async () => {
      try {
        const current = await chrome.permissions.contains({ origins: permission.origins });
        const changed = current
          ? await chrome.permissions.remove({ origins: permission.origins })
          : await chrome.permissions.request({ origins: permission.origins });
        setStatus(changed ? `Accès ${current ? 'retiré' : 'autorisé'} : ${permission.label}` : 'Aucune modification des autorisations', changed ? 'saved' : '');
        await refreshPermissionStatus();
      } catch {
        setStatus(`Impossible de modifier l’accès : ${permission.label}`, 'error');
      }
    });
  }
}

async function initialize() {
  try {
    const settings = await CardmarketSettings.loadSettings(chrome.storage.local);
    populateShippingCountries(document.getElementById('shippingDestinationCountry'));
    bindForm(settings);
    setStatus('Réglages chargés', 'saved');
    bindPermissionButtons();
    await refreshPermissionStatus();
  } catch {
    setStatus('Impossible de charger les réglages', 'error');
  }
}

initialize();

function populateShippingCountries(select) {
  if (!select || !Array.isArray(CardmarketCore?.SHIPPING_COUNTRIES)) return;
  for (const country of CardmarketCore.SHIPPING_COUNTRIES) {
    const option = document.createElement('option');
    option.value = String(country.id);
    option.textContent = country.name;
    select.append(option);
  }
}
