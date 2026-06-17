(function () {
  'use strict';

  const BUTTON_ID = 'yt-custom-miniplayer-btn';

  /**
   * 拡張機能のコンテキストが有効かどうかを確認する
   */
  function isExtensionContextValid() {
    try {
      return !!chrome.runtime && !!chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }

  function isWatchPage() {
    return location.pathname === '/watch';
  }

  // カスタムミニプレーヤーアイコン
  // data URI <img> を使い、YouTube の CSS カスケードからアイコンを完全に隔離する
  const ICON_DATA_URI = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 -10 110 110" fill="none"><rect x="5" y="5" width="100" height="80" rx="6" stroke="white" stroke-width="10"/><mask id="m" fill="white"><rect x="50" y="40" width="45" height="35" rx="5"/></mask><rect x="50" y="40" width="45" height="35" rx="5" stroke="white" stroke-width="20" mask="url(#m)"/></svg>')}`;

  /**
   * ボタンの表示・非表示を切り替える
   */
  function removeButton() {
    const existing = document.getElementById(BUTTON_ID);
    if (existing) existing.remove();
  }

  // --- Shorts Blocker ---

  const SHORTS_LABELS = ['ショート', 'Shorts'];
  const GAME_ROOM_LABELS = [
    'ゲームルーム',   // 日本語
    'Gaming',        // English / Deutsch / Nederlands
    '게임',           // 한국어
    '游戏',           // 中文（简体）
    '遊戲',           // 中文（繁體）
    'Videojuegos',   // Español
    'Jogos',         // Português
    'Jeux',          // Français
    'Giochi',        // Italiano
    'Spiele',        // Deutsch (alternative)
    'Игры',          // Русский
    'الألعاب',       // العربية
    'Oyun',          // Türkçe
    'Gry',           // Polski
    'เกม',           // ภาษาไทย
    'Trò chơi',      // Tiếng Việt
    'गेमिंग',        // हिन्दी
    'Games',         // Bahasa Indonesia / Bahasa Melayu
  ];
  const SHORTS_STYLE_ID = 'yt-shorts-blocker-style';

  // CSS で即座に非表示にできる Shorts 要素（テキスト照合不要なもの）
  const SHORTS_CSS = [
    'ytd-rich-shelf-renderer[is-shorts]',
    'ytd-reel-shelf-renderer',
  ].join(',') + '{ display: none !important; }';

  function injectShortsCSS() {
    if (document.getElementById(SHORTS_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = SHORTS_STYLE_ID;
    style.textContent = SHORTS_CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function removeShortsCSS() {
    const style = document.getElementById(SHORTS_STYLE_ID);
    if (style) style.remove();
  }

  function isShortsLabel(text) {
    return SHORTS_LABELS.includes(text.trim());
  }

  function isGameRoomLabel(text) {
    return GAME_ROOM_LABELS.includes(text.trim());
  }

  function removeShorts() {
    document.querySelectorAll('ytd-guide-entry-renderer').forEach((el) => {
      const title = el.querySelector('.title');
      if (title && isShortsLabel(title.textContent)) el.remove();
    });
    document.querySelectorAll('ytd-mini-guide-entry-renderer').forEach((el) => {
      const label = el.querySelector('.guide-entry-label');
      if (label && isShortsLabel(label.textContent)) el.remove();
    });
    document.querySelectorAll('yt-chip-cloud-chip-renderer').forEach((el) => {
      const text = el.querySelector('yt-formatted-string');
      if (text && isShortsLabel(text.textContent)) el.remove();
    });
    document.querySelectorAll('ytd-rich-shelf-renderer').forEach((el) => {
      const title = el.querySelector('#title-text');
      if (title && isShortsLabel(title.textContent)) el.remove();
    });
  }

  function removeGameRoom() {
    document.querySelectorAll('ytd-guide-entry-renderer').forEach((el) => {
      const title = el.querySelector('.title');
      if (title && isGameRoomLabel(title.textContent)) el.remove();
    });
    document.querySelectorAll('ytd-mini-guide-entry-renderer').forEach((el) => {
      const label = el.querySelector('.guide-entry-label');
      if (label && isGameRoomLabel(label.textContent)) el.remove();
    });
    document.querySelectorAll('yt-chip-cloud-chip-renderer').forEach((el) => {
      const text = el.querySelector('yt-formatted-string');
      if (text && isGameRoomLabel(text.textContent)) el.remove();
    });
  }

  // SPA ナビゲーション時に /shorts/ URL を /watch に転送する
  function redirectShortsUrl() {
    const match = location.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
    if (match) {
      location.replace('https://www.youtube.com/watch?v=' + match[1]);
      return true;
    }
    return false;
  }

  let shortsObserver = null;
  let isShortsBlocked = false;

  function startShortsBlocking() {
    isShortsBlocked = true;
    injectShortsCSS();
    removeShorts();
    removeGameRoom();
    redirectShortsUrl();
    if (!shortsObserver) {
      shortsObserver = new MutationObserver((mutations) => {
        if (mutations.some((m) => m.addedNodes.length > 0)) {
          removeShorts();
          removeGameRoom();
        }
      });
      shortsObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
    }
  }

  function stopShortsBlocking() {
    isShortsBlocked = false;
    removeShortsCSS();
    if (shortsObserver) {
      shortsObserver.disconnect();
      shortsObserver = null;
    }
  }

  if (isExtensionContextValid()) {
    chrome.storage.local.get({ shortsBlocked: false }, (result) => {
      if (result.shortsBlocked) startShortsBlocking();
    });
  }

  // --- メッセージリスナー ---

  /**
   * ポップアップからのメッセージを受信する
   */
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'toggle') {
      if (message.enabled) {
        injectButton();
      } else {
        removeButton();
      }
    }
    if (message.type === 'shortsToggle') {
      if (message.enabled) {
        startShortsBlocking();
      } else {
        stopShortsBlocking();
      }
    }
  });

  /**
   * ミニプレーヤーモードを起動する
   * コンテキストメニューを一時的に表示してミニプレーヤー項目をクリック
   */
  function activateMiniPlayer() {
    const video = document.querySelector('video');
    if (!video) return;

    video.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    requestAnimationFrame(() => {
      const menuItems = document.querySelectorAll('.ytp-menuitem');
      const miniItem = Array.from(menuItems).find(el =>
        el.textContent.includes('ミニプレーヤー') ||
        el.textContent.includes('Mini player') ||
        el.textContent.includes('Miniplayer') ||
        el.textContent.toLowerCase().includes('mini')
      );
      if (miniItem) {
        miniItem.click();
      }
    });
  }

  /**
   * YouTube スタイルのツールチップを作成する
   */
  function createTooltip() {
    const container = document.createElement('div');
    container.style.cssText = `
      position: absolute;
      bottom: 49px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.1s ease-in;
      white-space: nowrap;
    `;

    const text = document.createElement('span');
    text.textContent = 'Miniplayer';
    text.style.cssText = `
      background: rgba(28, 28, 28, 0.9);
      color: #fff;
      font-family: Roboto, Arial, sans-serif;
      font-size: 12px;
      font-weight: 500;
      line-height: 16px;
      padding: 5px 8px;
      border-radius: 2px;
      display: block;
    `;
    container.appendChild(text);

    const arrow = document.createElement('div');
    arrow.style.cssText = `
      position: absolute;
      bottom: -4px;
      left: 50%;
      transform: translateX(-50%);
      width: 0;
      height: 0;
      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      border-top: 5px solid rgba(28, 28, 28, 0.9);
    `;
    container.appendChild(arrow);

    return container;
  }

  /**
   * カスタムボタンを作成する
   */
  function createButton() {
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.className = 'ytp-button';
    btn.setAttribute('aria-label', 'Miniplayer');
    // height・padding を上書きせず YouTube の .ytp-button スタイルに任せる
    // vertical-align: middle で他ボタンと縦位置を揃える
    btn.style.cssText = `
      width: 48px !important;
      padding: 0 !important;
      opacity: 0.9;
      cursor: pointer;
      background: none;
      border: none;
      outline: none;
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      position: relative;
      vertical-align: middle;
    `;
    const img = document.createElement('img');
    img.src = ICON_DATA_URI;
    img.style.cssText = 'width: 24px !important; height: 24px !important; display: block !important; pointer-events: none;';
    img.setAttribute('draggable', 'false');
    btn.appendChild(img);

    const tooltip = createTooltip();
    btn.appendChild(tooltip);

    btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; tooltip.style.opacity = '1'; });
    btn.addEventListener('mouseleave', () => { btn.style.opacity = '0.9'; tooltip.style.opacity = '0'; });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      activateMiniPlayer();
    });

    return btn;
  }

  /**
   * コントロールバーにボタンを注入する
   */
  function injectButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const rightControlsRight = document.querySelector('.ytp-right-controls-right');
    if (rightControlsRight) {
      const fullscreenBtn = rightControlsRight.querySelector('.ytp-fullscreen-button');
      const btn = createButton();
      if (fullscreenBtn) {
        rightControlsRight.insertBefore(btn, fullscreenBtn);
      } else {
        rightControlsRight.insertBefore(btn, rightControlsRight.firstChild);
      }
      return;
    }

    const rightControls = document.querySelector('.ytp-right-controls');
    if (!rightControls) return;

    const fullscreenBtn = rightControls.querySelector('.ytp-fullscreen-button');
    const btn = createButton();
    if (fullscreenBtn) {
      rightControls.insertBefore(btn, fullscreenBtn);
    } else {
      rightControls.appendChild(btn);
    }
  }

  function observePlayerReady() {
    let domObserverConnected = false;
    let castObserverInstance = null;
    let castObserverPlayer = null;

    // SPA ナビゲーション・初回注入用の広域オブザーバー
    const domObserver = new MutationObserver(() => {
      const rightControls = document.querySelector('.ytp-right-controls');
      if (rightControls && !document.getElementById(BUTTON_ID)) {
        if (!isExtensionContextValid()) return;
        chrome.storage.local.get({ enabled: true }, (result) => {
          if (result.enabled) injectButton();
        });
      }
    });

    // キャスト状態変化専用オブザーバー
    function attachCastObserver() {
      const player = document.querySelector('.html5-video-player');
      if (!player || player === castObserverPlayer) return;

      if (castObserverInstance) castObserverInstance.disconnect();

      castObserverInstance = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.attributeName === 'class') {
            setTimeout(() => {
              if (!document.getElementById(BUTTON_ID) && isExtensionContextValid()) {
                chrome.storage.local.get({ enabled: true }, (result) => {
                  if (result.enabled) injectButton();
                });
              }
            }, 200);
            break;
          }
        }
      });
      castObserverInstance.observe(player, { attributes: true, attributeFilter: ['class'] });
      castObserverPlayer = player;
    }

    function disconnectCastObserver() {
      if (castObserverInstance) {
        castObserverInstance.disconnect();
        castObserverInstance = null;
        castObserverPlayer = null;
      }
    }

    function activateObservers() {
      if (!domObserverConnected) {
        domObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
        domObserverConnected = true;
      }
      attachCastObserver();
      if (!isExtensionContextValid()) return;
      chrome.storage.local.get({ enabled: true }, (result) => {
        if (result.enabled) injectButton();
      });
    }

    function deactivateObservers() {
      if (domObserverConnected) {
        domObserver.disconnect();
        domObserverConnected = false;
      }
      disconnectCastObserver();
      removeButton();
    }

    document.addEventListener('yt-navigate-finish', () => {
      if (isShortsBlocked && redirectShortsUrl()) return;
      if (isWatchPage()) {
        activateObservers();
      } else {
        deactivateObservers();
      }
    });

    if (isWatchPage()) {
      activateObservers();
    }
  }

  if (isWatchPage() && isExtensionContextValid()) {
    chrome.storage.local.get({ enabled: true }, (result) => {
      if (result.enabled) {
        injectButton();
      }
    });
  }
  observePlayerReady();
})();
