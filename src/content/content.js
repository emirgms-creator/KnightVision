/**
 * Chess AI Assistant - Content Script
 * Observes board mutations and broadcasts FEN state changes to the Side Panel.
 */

(function () {
  const parser = new ChessBoardParser();
  let lastFEN = '';
  let lastStableState = null;
  let observer = null;
  let debounceTimer = null;
  let retries = 0;
  let isInteracting = false;
  let interactionSafetyTimer = null;

  function setInteracting(val) {
    isInteracting = val;
    clearTimeout(interactionSafetyTimer);
    if (val) {
      // Safety timeout: prevent getting permanently stuck if mouseup occurs outside window
      interactionSafetyTimer = setTimeout(() => {
        isInteracting = false;
        checkBoardUpdate();
      }, 1500);
    }
  }

  function isDraggingActive() {
    const draggingEl = document.querySelector(
      '.dragging, [class*="dragging"], .is-dragging, cg-board.dragging, .cg-wrap.dragging, piece.dragging, .piece.dragging'
    );
    return isInteracting || draggingEl !== null;
  }

  // Pointer event listeners to suppress updates while dragging/holding pieces
  window.addEventListener('mousedown', (e) => {
    if (e.target && e.target.closest && e.target.closest('piece, .piece, cg-board, chess-board, wc-chess-board, [data-square], .board')) {
      setInteracting(true);
    }
  }, true);

  window.addEventListener('mouseup', () => {
    if (isInteracting) {
      setInteracting(false);
      // Wait for release animation to settle on destination square
      setTimeout(checkBoardUpdate, 200);
    }
  }, true);

  window.addEventListener('blur', () => {
    if (isInteracting) {
      setInteracting(false);
      setTimeout(checkBoardUpdate, 200);
    }
  });

  document.addEventListener('mouseleave', () => {
    if (isInteracting) {
      setInteracting(false);
      setTimeout(checkBoardUpdate, 200);
    }
  });

  window.addEventListener('touchstart', (e) => {
    if (e.target && e.target.closest && e.target.closest('piece, .piece, cg-board, chess-board, wc-chess-board, [data-square], .board')) {
      setInteracting(true);
    }
  }, { passive: true, capture: true });

  window.addEventListener('touchend', () => {
    if (isInteracting) {
      setInteracting(false);
      setTimeout(checkBoardUpdate, 200);
    }
  }, { passive: true, capture: true });

  function initObserver() {
    const boardElement = document.querySelector(
      'chess-board, wc-chess-board, #board-layout-main, .board, cg-board, cg-container, .cg-wrap, [class*="chessboard"], [data-square], #board'
    );
    if (!boardElement) {
      // Retry up to 8 times (~12 seconds) so non-chess sites don't consume CPU
      if (retries < 8) {
        retries++;
        setTimeout(initObserver, 1500);
      }
      return;
    }
    retries = 0;

    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      // 150ms debounce to allow multi-piece DOM animation updates to settle
      debounceTimer = setTimeout(checkBoardUpdate, 150);
    });

    observer.observe(boardElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'cg-key', 'data-piece', 'src', 'data-square']
    });

    console.log('[KnightVision] Universal board observer active.');
    checkBoardUpdate();
  }

  function checkBoardUpdate() {
    try {
      if (!chrome.runtime || !chrome.runtime.id) {
        if (observer) observer.disconnect();
        return;
      }

      // Do not broadcast or analyze mid-drag/hold
      if (isDraggingActive()) {
        return;
      }

      const state = parser.getBoardState();
      if (!state || !state.fen) return;

      // Extract only piece placement + active color for change check
      const currentKey = state.fen.split(' ').slice(0, 2).join(' ');
      const lastKey = lastFEN.split(' ').slice(0, 2).join(' ');

      if (currentKey !== lastKey) {
        lastFEN = state.fen;
        lastStableState = state;
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
      if (isDraggingActive() && lastStableState) {
        sendResponse(lastStableState);
      } else {
        const state = parser.getBoardState();
        if (state) lastStableState = state;
        sendResponse(state);
      }
    }
    return true;
  });

  // Start observing when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initObserver);
  } else {
    initObserver();
  }

  // Periodic safety sync and lightweight SPA URL change detection
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(initObserver, 1000);
    }
    if (observer) {
      checkBoardUpdate();
    }
  }, 1000);

  window.addEventListener('popstate', () => {
    setTimeout(initObserver, 1000);
  });
})();
