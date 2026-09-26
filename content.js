(function () {
  'use strict';

  const BUTTON_ID = 'yt-custom-miniplayer-btn';
  let isMiniplayerEnabled = false;

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
  const SHORTS_STYLE_ID = 'yt-shorts-blocker-style';
  const PLAYABLES_STYLE_ID = 'yt-playables-blocker-style';
  const SHORTS_HIDDEN_ATTR = 'data-yt-tools-shorts-hidden';
  const PLAYABLES_HIDDEN_ATTR = 'data-yt-tools-playables-hidden';

  // CSS で即座に非表示にできる Shorts 要素（テキスト照合不要なもの）
  const SHORTS_CSS = [
    'ytd-rich-shelf-renderer[is-shorts]',
    'ytd-reel-shelf-renderer',
    `[${SHORTS_HIDDEN_ATTR}]`,
  ].join(',') + '{ display: none !important; }';

  const PLAYABLES_CSS = `[${PLAYABLES_HIDDEN_ATTR}]{ display: none !important; }`;

  function injectStyle(id, css) {
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function removeStyle(id) {
    const style = document.getElementById(id);
    if (style) style.remove();
  }

  function injectShortsCSS() {
    injectStyle(SHORTS_STYLE_ID, SHORTS_CSS);
  }

  function removeShortsCSS() {
    removeStyle(SHORTS_STYLE_ID);
  }

  function isShortsLabel(text) {
    return SHORTS_LABELS.includes(text.trim());
  }

  function removeShorts() {
    document.querySelectorAll('ytd-guide-entry-renderer').forEach((el) => {
      const title = el.querySelector('.title');
      if (title && isShortsLabel(title.textContent)) el.setAttribute(SHORTS_HIDDEN_ATTR, '');
    });
    document.querySelectorAll('ytd-mini-guide-entry-renderer').forEach((el) => {
      const label = el.querySelector('.guide-entry-label');
      if (label && isShortsLabel(label.textContent)) el.setAttribute(SHORTS_HIDDEN_ATTR, '');
    });
    document.querySelectorAll('yt-chip-cloud-chip-renderer').forEach((el) => {
      const text = el.querySelector('yt-formatted-string');
      if (text && isShortsLabel(text.textContent)) el.setAttribute(SHORTS_HIDDEN_ATTR, '');
    });
    document.querySelectorAll('ytd-rich-shelf-renderer, ytd-shelf-renderer').forEach((el) => {
      const title = el.querySelector('#title-text');
      if (title && isShortsLabel(title.textContent)) el.setAttribute(SHORTS_HIDDEN_ATTR, '');
    });
    document.querySelectorAll('ytd-video-renderer, ytd-compact-video-renderer').forEach((el) => {
      const link = el.querySelector('a#video-title, a#thumbnail');
      if (link && (link.getAttribute('href') || '').startsWith('/shorts/')) {
        el.setAttribute(SHORTS_HIDDEN_ATTR, '');
      }
    });
  }

  function restoreShorts() {
    document.querySelectorAll(`[${SHORTS_HIDDEN_ATTR}]`).forEach((el) => {
      el.removeAttribute(SHORTS_HIDDEN_ATTR);
    });
  }

  function isPlayablesEntry(el) {
    const link = el.querySelector('a');
    const href = link ? link.getAttribute('href') || '' : '';
    return href === '/playables' || href.startsWith('/playables?') || href.startsWith('/playables/');
  }

  function removePlayables() {
    document.querySelectorAll('ytd-guide-entry-renderer').forEach((el) => {
      if (isPlayablesEntry(el)) el.setAttribute(PLAYABLES_HIDDEN_ATTR, '');
    });
    document.querySelectorAll('ytd-mini-guide-entry-renderer').forEach((el) => {
      if (isPlayablesEntry(el)) el.setAttribute(PLAYABLES_HIDDEN_ATTR, '');
    });
    document.querySelectorAll('ytd-rich-item-renderer, ytd-item-section-renderer, yt-chip-cloud-chip-renderer').forEach((el) => {
      const link = el.querySelector('a[href^="/playables"]');
      if (link) el.setAttribute(PLAYABLES_HIDDEN_ATTR, '');
    });
  }

  function restorePlayables() {
    document.querySelectorAll(`[${PLAYABLES_HIDDEN_ATTR}]`).forEach((el) => {
      el.removeAttribute(PLAYABLES_HIDDEN_ATTR);
    });
  }

  // SPA ナビゲーション時に /shorts/ → /watch へ転送する
  function redirectShortsUrl() {
    const shortsMatch = location.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shortsMatch) {
      const params = new URLSearchParams(location.search);
      const extra = [];
      if (params.has('list')) extra.push('list=' + encodeURIComponent(params.get('list')));
      if (params.has('index')) extra.push('index=' + encodeURIComponent(params.get('index')));
      const query = extra.length ? '&' + extra.join('&') : '';
      location.replace('https://www.youtube.com/watch?v=' + shortsMatch[1] + query);
      return true;
    }
    return false;
  }

  function redirectPlayablesUrl() {
    if (!location.pathname.startsWith('/playables')) return false;
    location.replace('https://www.youtube.com/');
    return true;
  }

  let isShortsBlocked = false;
  let isPlayablesBlocked = false;
  let blockerObserver = null;
  let blockerRafPending = false;

  function updateBlockerObserver() {
    if (!isShortsBlocked && !isPlayablesBlocked) {
      if (blockerObserver) blockerObserver.disconnect();
      blockerObserver = null;
      blockerRafPending = false;
      return;
    }
    if (blockerObserver) return;
    blockerObserver = new MutationObserver((mutations) => {
      if (blockerRafPending || !mutations.some((m) => m.addedNodes.length > 0)) return;
      blockerRafPending = true;
      requestAnimationFrame(() => {
        blockerRafPending = false;
        if (isShortsBlocked) removeShorts();
        if (isPlayablesBlocked) removePlayables();
      });
    });
    blockerObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  function startShortsBlocking() {
    isShortsBlocked = true;
    injectShortsCSS();
    removeShorts();
    redirectShortsUrl();
    updateBlockerObserver();
  }

  function stopShortsBlocking() {
    isShortsBlocked = false;
    removeShortsCSS();
    restoreShorts();
    updateBlockerObserver();
  }

  function setPlayablesBlocking(enabled) {
    isPlayablesBlocked = enabled;
    if (enabled) {
      injectStyle(PLAYABLES_STYLE_ID, PLAYABLES_CSS);
      removePlayables();
      redirectPlayablesUrl();
    } else {
      removeStyle(PLAYABLES_STYLE_ID);
      restorePlayables();
    }
    updateBlockerObserver();
  }

  if (isExtensionContextValid()) {
    chrome.storage.local.get({ shortsBlocked: false, playablesBlocked: false }, (result) => {
      if (result.shortsBlocked) startShortsBlocking();
      setPlayablesBlocking(result.playablesBlocked);
    });
  }

  // --- メッセージリスナー ---

  /**
   * ポップアップからのメッセージを受信する
   */
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'toggle') {
      isMiniplayerEnabled = message.enabled;
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
    if (message.type === 'playablesToggle') {
      setPlayablesBlocking(message.enabled);
    }
  });

  /**
   * ミニプレーヤーモードを起動する
   * コンテキストメニューを一時的に表示してミニプレーヤー項目をクリック
   */
  function activateMiniPlayer() {
    const player = document.querySelector('.html5-video-player');
    const video = player && player.querySelector('video');
    if (!video) return;

    // YouTube側のボタンがDOMに残っている場合は、その標準処理を優先する。
    const nativeButton = player.querySelector('.ytp-miniplayer-button');
    if (nativeButton && nativeButton.id !== BUTTON_ID) {
      nativeButton.click();
      return;
    }

    video.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    const labels = ['ミニプレーヤー', 'mini player', 'miniplayer'];
    let attempts = 0;

    function clickMenuItemWhenReady() {
      attempts += 1;
      // YouTubeはコンテキストメニューをplayer外へ配置することがあるため、
      // document全体から「表示中のコンテキストメニュー」だけを対象にする。
      const menus = Array.from(document.querySelectorAll('.ytp-contextmenu')).filter((el) => {
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0;
      });
      const menuItems = menus.flatMap((menu) => Array.from(menu.querySelectorAll('.ytp-menuitem')));
      const miniItem = Array.from(menuItems).find((el) => {
        const text = (el.getAttribute('aria-label') || el.textContent).trim().toLowerCase();
        return labels.some((label) => text === label || text.startsWith(`${label} `) || text.startsWith(`${label}（`));
      });
      if (miniItem) {
        miniItem.click();
        return;
      }
      if (attempts < 6) {
        setTimeout(clickMenuItemWhenReady, 50);
        return;
      }
      // 項目が見つからなければ、開いたコンテキストメニューを閉じる。
      video.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      // YouTube標準のミニプレーヤーショートカットを最後の代替手段として送る。
      const shortcut = { key: 'i', code: 'KeyI', keyCode: 73, which: 73, bubbles: true, cancelable: true };
      document.dispatchEvent(new KeyboardEvent('keydown', shortcut));
      document.dispatchEvent(new KeyboardEvent('keyup', shortcut));
    }

    setTimeout(clickMenuItemWhenReady, 0);
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
    text.textContent = chrome.i18n.getMessage('miniplayerTooltip') || 'Miniplayer [I]';
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
    btn.setAttribute('aria-label', chrome.i18n.getMessage('miniplayerTooltip') || 'Miniplayer [I]');
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
    let bootstrapObserverConnected = false;
    let controlsObserverInstance = null;
    let controlsObserverPlayer = null;
    let castObserverInstance = null;
    let castObserverPlayer = null;

    // プレーヤーがまだない初回読み込みだけ、ページ全体を監視する。
    let domRafPending = false;
    const bootstrapObserver = new MutationObserver(() => {
      if (domRafPending) return;
      domRafPending = true;
      requestAnimationFrame(() => {
        domRafPending = false;
        const player = document.querySelector('.html5-video-player');
        if (!player) return;
        attachControlsObserver();
        bootstrapObserver.disconnect();
        bootstrapObserverConnected = false;
      });
    });

    // YouTubeがコントロールバーを再構築してもボタンを戻せるよう、
    // ページ全体ではなくプレーヤー内だけを継続監視する。
    function attachControlsObserver() {
      const player = document.querySelector('.html5-video-player');
      if (!player || player === controlsObserverPlayer) return;
      if (controlsObserverInstance) controlsObserverInstance.disconnect();
      controlsObserverInstance = new MutationObserver(() => {
        if (!isMiniplayerEnabled || document.getElementById(BUTTON_ID) || !isExtensionContextValid()) return;
        injectButton();
      });
      controlsObserverInstance.observe(player, { childList: true, subtree: true });
      controlsObserverPlayer = player;
    }

    function disconnectControlsObserver() {
      if (controlsObserverInstance) controlsObserverInstance.disconnect();
      controlsObserverInstance = null;
      controlsObserverPlayer = null;
    }

    // キャスト状態変化専用オブザーバー
    function attachCastObserver() {
      const player = document.querySelector('.html5-video-player');
      if (!player || player === castObserverPlayer) return;

      if (castObserverInstance) castObserverInstance.disconnect();

      castObserverInstance = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.attributeName === 'class') {
            setTimeout(() => {
              if (isMiniplayerEnabled && !document.getElementById(BUTTON_ID) && isExtensionContextValid()) {
                injectButton();
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
      attachControlsObserver();
      if (!controlsObserverPlayer && !bootstrapObserverConnected) {
        bootstrapObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
        bootstrapObserverConnected = true;
      }
      attachCastObserver();
      if (isMiniplayerEnabled && isExtensionContextValid()) injectButton();
    }

    function deactivateObservers() {
      if (bootstrapObserverConnected) {
        bootstrapObserver.disconnect();
        bootstrapObserverConnected = false;
      }
      disconnectControlsObserver();
      disconnectCastObserver();
      removeButton();
    }

    document.addEventListener('yt-navigate-finish', () => {
      if (isShortsBlocked && redirectShortsUrl()) return;
      if (isPlayablesBlocked && redirectPlayablesUrl()) return;
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

  if (isExtensionContextValid()) {
    chrome.storage.local.get({ enabled: true }, (result) => {
      isMiniplayerEnabled = result.enabled;
      if (isMiniplayerEnabled && isWatchPage()) injectButton();
    });
  }
  observePlayerReady();
})();
