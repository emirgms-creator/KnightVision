/**
 * Chess AI Assistant - Content Script
 * Observes board mutations and broadcasts FEN state changes to the Side Panel.
 */

(function () {
  const parser = new ChessBoardParser();
  let lastFEN = '';
  let observer = null;
  let debounceTimer = null;

  function initObserver() {
    const boardElement = document.querySelector('chess-board, wc-chess-board, #board-layout-main, .board, cg-board, cg-container');
    if (!boardElement) {
      // Retry if board is not loaded yet (single-page app navigation)
      setTimeout(initObserver, 1000);
      return;
    }

    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      // 100ms debounce to allow multi-piece DOM animation updates to settle
      debounceTimer = setTimeout(checkBoardUpdate, 100);
    });

    observer.observe(boardElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'cg-key']
    });

    console.log('[KnightVision] Board observer active.');
    checkBoardUpdate();
  }

  function checkBoardUpdate() {
    try {
      const state = parser.getBoardState();
      if (!state || !state.fen) return;

      // Extract only piece placement + active color for change check
      const currentKey = state.fen.split(' ').slice(0, 2).join(' ');
      const lastKey = lastFEN.split(' ').slice(0, 2).join(' ');

      if (currentKey !== lastKey) {
        lastFEN = state.fen;
        chrome.runtime.sendMessage({
          type: 'BOARD_UPDATE',
          data: state
        }, () => {
          // Explicitly consume lastError when Side Panel is closed or not listening
          if (chrome.runtime.lastError) {
            /* quiet */
          }
        });
      }
    } catch (err) {
      console.warn('[KnightVision] Error parsing board:', err);
    }
  }

  // Listen for requests from Side Panel
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_BOARD_STATE') {
      const state = parser.getBoardState();
      sendResponse(state);
    } else if (request.type === 'SET_MANUAL_TURN') {
      parser.turn = request.turn;
      checkBoardUpdate();
      sendResponse({ success: true });
    }
    return true;
  });

  // Start observing when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initObserver);
  } else {
    initObserver();
  }

  // Handle SPA URL/Page changes (rematch, next game)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      setTimeout(initObserver, 1500);
    }
  }).observe(document, { subtree: true, childList: true });
})();
