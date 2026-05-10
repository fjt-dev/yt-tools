(function () {
  'use strict';

  const toggle = document.getElementById('toggle');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statusSpan = document.getElementById('statusSpan');
  const statusCard = document.getElementById('statusCard');

  const shortsToggle = document.getElementById('shortsToggle');
  const shortsDot = document.getElementById('shortsDot');
  const shortsText = document.getElementById('shortsText');
  const shortsSpan = document.getElementById('shortsSpan');
  const shortsCard = document.getElementById('shortsCard');

  function updateUI(enabled) {
    if (enabled) {
      statusDot.classList.remove('off');
      statusText.textContent = 'Enabled';
      statusCard.classList.add('active');
      statusSpan.textContent = 'enabled';
      statusSpan.classList.remove('off');
    } else {
      statusDot.classList.add('off');
      statusText.textContent = 'Disabled';
      statusCard.classList.remove('active');
      statusSpan.textContent = 'disabled';
      statusSpan.classList.add('off');
    }
  }

  function updateShortsUI(enabled) {
    if (enabled) {
      shortsDot.classList.remove('off');
      shortsText.textContent = 'Enabled';
      shortsCard.classList.add('active');
      shortsSpan.textContent = 'enabled';
      shortsSpan.classList.remove('off');
    } else {
      shortsDot.classList.add('off');
      shortsText.textContent = 'Disabled';
      shortsCard.classList.remove('active');
      shortsSpan.textContent = 'disabled';
      shortsSpan.classList.add('off');
    }
  }

  // 保存済みの状態を読み込む
  chrome.storage.local.get({ enabled: true, shortsBlocked: false }, (result) => {
    toggle.checked = result.enabled;
    updateUI(result.enabled);

    shortsToggle.checked = result.shortsBlocked;
    updateShortsUI(result.shortsBlocked);
  });

  // Miniplayer トグル変更時
  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    chrome.storage.local.set({ enabled }, () => {
      updateUI(enabled);

      chrome.tabs.query({ url: 'https://www.youtube.com/watch*' }, (tabs) => {
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { type: 'toggle', enabled }).catch(() => {});
        }
      });
    });
  });

  // Shorts Blocker トグル変更時
  shortsToggle.addEventListener('change', () => {
    const enabled = shortsToggle.checked;
    chrome.storage.local.set({ shortsBlocked: enabled }, () => {
      updateShortsUI(enabled);

      if (enabled) {
        chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ['ruleset_shorts'] });
      } else {
        chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: ['ruleset_shorts'] });
      }

      chrome.tabs.query({ url: 'https://www.youtube.com/*' }, (tabs) => {
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { type: 'shortsToggle', enabled }).catch(() => {});
        }
      });
    });
  });
})();
