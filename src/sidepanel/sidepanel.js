/**
 * KnightVision - Clean Monochrome Side Panel Controller
 * Real-time chess board perception and Stockfish engine analysis.
 */

(function () {
  let engine = null;
  let isEngineReady = false;
  let isSearching = false;
  let pendingFen = null;
  let currentFen = '';
  let colorMode = 'auto';           // 'auto' or 'manual'
  let manualColor = 'w';            // 'w' or 'b'
  let detectedBoardColor = 'w';     // 'w' or 'b'
  let playerColor = 'w';            // Active effective perspective
  let thinkingTime = 1000;
  let currentElo = 'max';
  let multiPVLines = {};

  // DOM Elements
  const btnChooseAuto = document.getElementById('btn-choose-auto');
  const btnChooseWhite = document.getElementById('btn-choose-white');
  const btnChooseBlack = document.getElementById('btn-choose-black');
  const moveColorBadge = document.getElementById('move-color-badge');
  const moveRoleBadge = document.getElementById('move-role-badge');
  const moveDepth = document.getElementById('move-depth');
  const pieceBox = document.getElementById('piece-box');
  const movePieceIcon = document.getElementById('move-piece-icon');
  const bestMoveText = document.getElementById('best-move-text');
  const moveDesc = document.getElementById('move-desc');
  const evalScore = document.getElementById('eval-score');
  const evalFill = document.getElementById('eval-fill');
  const alternativesList = document.getElementById('alternatives-list');
  const eloSelect = document.getElementById('elo-select');
  const timeSelect = document.getElementById('time-select');
  const btnScan = document.getElementById('btn-scan');
  const btnCopyFen = document.getElementById('btn-copy-fen');
  const fenInput = document.getElementById('fen-input');

  const PIECE_CONFIG = {
    w: {
      P: { name: 'White Pawn', icon: '♙' },
      N: { name: 'White Knight', icon: '♘' },
      B: { name: 'White Bishop', icon: '♗' },
      R: { name: 'White Rook', icon: '♖' },
      Q: { name: 'White Queen', icon: '♕' },
      K: { name: 'White King', icon: '♔' }
    },
    b: {
      P: { name: 'Black Pawn', icon: '♟' },
      N: { name: 'Black Knight', icon: '♞' },
      B: { name: 'Black Bishop', icon: '♝' },
      R: { name: 'Black Rook', icon: '♜' },
      Q: { name: 'Black Queen', icon: '♛' },
      K: { name: 'Black King', icon: '♚' }
    }
  };

  /**
   * Initialize WebAssembly Stockfish Worker
   */
  function initEngine() {
    try {
      engine = new Worker('/src/engine/stockfish.js');

      engine.onmessage = function (event) {
        handleEngineOutput(event.data);
      };

      engine.onerror = function (err) {
        console.error('[KnightVision] Engine Worker Error:', err);
      };

      engine.postMessage('uci');
      engine.postMessage('setoption name MultiPV value 3');
      engine.postMessage('isready');
    } catch (err) {
      console.error('[KnightVision] Worker init error:', err);
    }
  }

  /**
   * Handle raw UCI messages from Stockfish
   */
  function handleEngineOutput(line) {
    if (typeof line !== 'string') return;

    if (line === 'uciok' || line === 'readyok') {
      isEngineReady = true;
      if (currentFen) {
        analyzePosition(currentFen);
      }
      return;
    }

    // Parse Search Progress (PV and evaluation)
    if (line.startsWith('info') && line.includes('pv')) {
      parseInfoLine(line);
    }

    // Parse Best Move
    if (line.startsWith('bestmove')) {
      isSearching = false;

      // If a newer board state arrived during previous analysis, start analyzing it now
      if (pendingFen) {
        const nextFen = pendingFen;
        pendingFen = null;
        startSearch(nextFen);
        return; // Discard stale bestmove
      }

      const parts = line.split(' ');
      const bestMove = parts[1];
      if (bestMove && bestMove !== '(none)') {
        renderBestMove(bestMove);
      }
    }
  }

  /**
   * Parse UCI info string (evaluation, depth, multi-pv)
   */
  function parseInfoLine(line) {
    // Depth
    const depthMatch = line.match(/\bdepth (\d+)\b/);
    if (depthMatch) {
      moveDepth.textContent = `D: ${depthMatch[1]}`;
    }

    // MultiPV index
    let pvIndex = 1;
    const pvIndexMatch = line.match(/\bmultipv (\d+)\b/);
    if (pvIndexMatch) {
      pvIndex = parseInt(pvIndexMatch[1], 10);
    }

    // Score: Centipawn or Mate
    let scoreDisplay = '0.00';
    let numericScore = 0;

    const cpMatch = line.match(/\bscore cp (-?\d+)\b/);
    const mateMatch = line.match(/\bscore mate (-?\d+)\b/);

    if (mateMatch) {
      const rawMate = parseInt(mateMatch[1], 10);
      // In UCI, score mate is from the perspective of the side to move
      const mateFromWhite = activeTurn === 'w' ? rawMate : -rawMate;
      scoreDisplay = `M${mateFromWhite > 0 ? '+' : ''}${mateFromWhite}`;
      numericScore = mateFromWhite > 0 ? 100 : -100;
    } else if (cpMatch) {
      const rawCp = parseInt(cpMatch[1], 10);
      const cpFromWhite = activeTurn === 'w' ? rawCp : -rawCp;
      numericScore = cpFromWhite / 100;
      scoreDisplay = (numericScore > 0 ? '+' : '') + numericScore.toFixed(2);
    }

    // Principal Variation moves
    const pvMatch = line.match(/\bpv (.+)$/);
    if (pvMatch) {
      const moves = pvMatch[1].trim().split(/\s+/);
      const firstMove = moves[0];

      multiPVLines[pvIndex] = {
        move: firstMove,
        score: scoreDisplay,
        numericScore: numericScore,
        fullLine: moves.slice(0, 3).join(' ')
      };

      if (pvIndex === 1) {
        updateEvaluation(numericScore, scoreDisplay);
        renderBestMove(firstMove);
      }
      renderAlternatives();
    }
  }

  /**
   * Update monochrome evaluation bar and numeric score
   */
  function updateEvaluation(score, scoreText) {
    evalScore.textContent = scoreText;

    let whitePercent = 50 + (score * 8);
    if (whitePercent > 95) whitePercent = 95;
    if (whitePercent < 5) whitePercent = 5;

    evalFill.style.width = `${whitePercent}%`;
  }

  /**
   * Render the best move card with high-contrast White vs Black styling
   */
  function renderBestMove(uciMove) {
    if (!uciMove || uciMove.length < 4) return;

    const fromSquare = uciMove.substring(0, 2);
    const toSquare = uciMove.substring(2, 4);
    const promotion = uciMove.length === 5 ? uciMove[4].toUpperCase() : '';

    const pieceChar = getPieceAtSquare(fromSquare, currentFen);
    const pieceLetter = pieceChar ? pieceChar.toUpperCase() : 'P';
    const isPieceBlack = pieceChar ? (pieceChar === pieceChar.toLowerCase()) : (activeTurn === 'b');
    const colorKey = isPieceBlack ? 'b' : 'w';

    const piece = PIECE_CONFIG[colorKey][pieceLetter] || {
      name: isPieceBlack ? 'Black Piece' : 'White Piece',
      icon: isPieceBlack ? '♟' : '♙'
    };

    // Styling according to active side
    if (!isPieceBlack) {
      moveColorBadge.className = 'badge badge-white';
      moveColorBadge.textContent = '⚪ WHITE';
      pieceBox.className = 'piece-box piece-white';
    } else {
      moveColorBadge.className = 'badge badge-black';
      moveColorBadge.textContent = '⚫ BLACK';
      pieceBox.className = 'piece-box piece-black';
    }

    // Role text: Is this for user or opponent?
    const isUserTurn = (activeTurn === playerColor);
    moveRoleBadge.textContent = isUserTurn ? '(Your Turn)' : "(Opponent's Move)";

    movePieceIcon.textContent = piece.icon;
    // Check if target square is occupied (Capture)
    const targetPieceChar = getPieceAtSquare(toSquare, currentFen);
    const isCapture = !!targetPieceChar;
    const targetColorKey = isPieceBlack ? 'w' : 'b';
    const targetPiece = targetPieceChar ? PIECE_CONFIG[targetColorKey][targetPieceChar.toUpperCase()] : null;

    const actionSymbol = isCapture ? '⚔' : '➔';
    bestMoveText.textContent = `${fromSquare.toUpperCase()} ${actionSymbol} ${toSquare.toUpperCase()}`;

    let desc = '';
    if (isCapture && targetPiece) {
      desc = `${piece.name} takes ${targetPiece.name} on ${toSquare.toUpperCase()}`;
    } else {
      desc = `${piece.name} to ${toSquare.toUpperCase()}`;
    }
    if (promotion) {
      const promoNames = { Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight' };
      desc += ` (Promote to ${promoNames[promotion] || promotion})`;
    }
    moveDesc.textContent = desc;
  }

  /**
   * Render alternative moves in clean list
   */
  function renderAlternatives() {
    const keys = Object.keys(multiPVLines).sort((a, b) => a - b);
    if (keys.length <= 1) return;

    alternativesList.innerHTML = '';
    keys.forEach((key) => {
      const line = multiPVLines[key];
      if (!line || !line.move || line.move.length < 4) return;

      const fromSq = line.move.substring(0, 2);
      const toSq = line.move.substring(2, 4);
      const targetChar = getPieceAtSquare(toSq, currentFen);
      const sym = targetChar ? '⚔' : '➔';

      const item = document.createElement('div');
      item.className = 'alt-item';
      item.innerHTML = `
        <div>
          <span class="alt-rank">#${key}</span>
          <span class="alt-move">${fromSq.toUpperCase()} ${sym} ${toSq.toUpperCase()}</span>
          <span style="font-size: 10px; color: #555; margin-left: 6px;">${line.fullLine}</span>
        </div>
        <span class="alt-score">${line.score}</span>
      `;
      alternativesList.appendChild(item);
    });
  }

  /**
   * Helper to locate piece on given square from FEN
   */
  function getPieceAtSquare(square, fen) {
    if (!fen || !square || square.length !== 2) return null;
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1], 10);
    const row = 8 - rank;
    const col = file;

    const placement = fen.split(' ')[0];
    const rows = placement.split('/');
    if (!rows[row]) return null;

    let c = 0;
    for (let char of rows[row]) {
      if (/\d/.test(char)) {
        c += parseInt(char, 10);
      } else {
        if (c === col) return char;
        c++;
      }
    }
    return null;
  }

  /**
   * Updates user perspective UI and active playerColor
   */
  function updateColorPerspective() {
    if (colorMode === 'auto') {
      btnChooseAuto.classList.add('active');
      btnChooseWhite.classList.remove('active');
      btnChooseBlack.classList.remove('active');
      playerColor = detectedBoardColor;
    } else {
      btnChooseAuto.classList.remove('active');
      if (manualColor === 'w') {
        btnChooseWhite.classList.add('active');
        btnChooseBlack.classList.remove('active');
        playerColor = 'w';
      } else {
        btnChooseBlack.classList.add('active');
        btnChooseWhite.classList.remove('active');
        playerColor = 'b';
      }
    }
    // Update role badge for current move
    const isUserTurn = (activeTurn === playerColor);
    moveRoleBadge.textContent = isUserTurn ? '(Your Turn)' : "(Opponent's Move)";
  }

  /**
   * Sets user's active color perspective
   */
  function setPlayerColor(color, isManual = false) {
    if (isManual) {
      colorMode = 'manual';
      manualColor = color;
    } else {
      detectedBoardColor = color;
    }
    updateColorPerspective();
  }

  /**
   * Trigger Stockfish analysis with race-condition prevention
   */
  function analyzePosition(fen) {
    if (!engine || !isEngineReady || !fen) return;

    currentFen = fen;
    fenInput.value = fen;
    multiPVLines = {};

    if (isSearching) {
      pendingFen = fen;
      engine.postMessage('stop');
      return;
    }

    startSearch(fen);
  }

  /**
   * Sends UCI position and search command to engine
   */
  function startSearch(fen) {
    if (!engine || !isEngineReady || !fen) return;
    isSearching = true;
    currentFen = fen;
    engine.postMessage(`position fen ${fen}`);
    engine.postMessage(`go movetime ${thinkingTime}`);
  }

  /**
   * Apply Elo strength limit
   */
  function applyEloSetting(val) {
    currentElo = val;
    if (!engine || !isEngineReady) return;

    if (val === 'max') {
      engine.postMessage('setoption name UCI_LimitStrength value false');
    } else {
      engine.postMessage('setoption name UCI_LimitStrength value true');
      engine.postMessage(`setoption name UCI_Elo value ${val}`);
    }

    if (currentFen) {
      analyzePosition(currentFen);
    }
  }

  /**
   * Listen for board updates from content script
   */
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'BOARD_UPDATE' && message.data) {
      const data = message.data;
      activeTurn = data.turn || 'w';

      // Auto-sync player color if board orientation was flipped
      if (data.playerColor) {
        setPlayerColor(data.playerColor, false);
      } else {
        updateColorPerspective();
      }

      // Always continuously compute best move regardless of turn
      analyzePosition(data.fen);
    }
  });

  /**
   * User Controls
   */
  btnChooseAuto.addEventListener('click', () => {
    colorMode = 'auto';
    updateColorPerspective();
  });

  btnChooseWhite.addEventListener('click', () => {
    setPlayerColor('w', true);
  });

  btnChooseBlack.addEventListener('click', () => {
    setPlayerColor('b', true);
  });

  eloSelect.addEventListener('change', (e) => {
    applyEloSetting(e.target.value);
  });

  timeSelect.addEventListener('change', (e) => {
    thinkingTime = parseInt(e.target.value, 10);
    if (currentFen) {
      analyzePosition(currentFen);
    }
  });

  let lastChessTabId = null;

  function clearBoardState(message = 'Open Chess.com or Lichess to analyze.') {
    if (!currentFen) return;
    currentFen = '';
    pendingFen = null;
    isSearching = false;
    lastChessTabId = null;
    if (engine) {
      engine.postMessage('stop');
    }
    bestMoveText.textContent = '-- ➔ --';
    moveDesc.textContent = message;
    moveColorBadge.className = 'badge badge-white';
    moveColorBadge.textContent = '⚪ WAITING';
    moveRoleBadge.textContent = '';
    moveDepth.textContent = '';
    movePieceIcon.textContent = '♙';
    pieceBox.className = 'piece-box piece-white';
    evalScore.textContent = '0.00';
    evalFill.style.width = '50%';
    fenInput.value = '';
    fenInput.placeholder = 'FEN: No active game detected';
    alternativesList.innerHTML = '<div style="color: #666; font-size: 11px; text-align: center; padding: 12px 0;">No active game detected</div>';
  }

  function fetchActiveBoardState(explicitScan = false) {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs2) => {
          if (tabs2 && tabs2[0]) sendBoardRequest(tabs2[0].id, explicitScan);
          else if (explicitScan) clearBoardState();
        });
        return;
      }
      sendBoardRequest(tab.id, explicitScan);
    });
  }

  function sendBoardRequest(tabId, explicitScan = false) {
    chrome.tabs.sendMessage(tabId, { type: 'GET_BOARD_STATE' }, (response) => {
      if (chrome.runtime.lastError || !response || !response.fen) {
        // If user explicitly pressed "Scan Board" on a non-chess page, clear the display.
        // But if user simply switched to another tab, KEEP the last chess analysis alive!
        if (explicitScan) {
          clearBoardState('No chess board detected on active tab.');
        }
        return;
      }

      // Valid chess board detected on this tab
      lastChessTabId = tabId;
      activeTurn = response.turn || 'w';
      if (response.playerColor) {
        setPlayerColor(response.playerColor, false);
      }
      analyzePosition(response.fen);
    });
  }

  btnScan.addEventListener('click', () => {
    bestMoveText.textContent = '-- ➔ --';
    moveDesc.textContent = 'Scanning board...';
    fetchActiveBoardState(true);
  });

  btnCopyFen.addEventListener('click', () => {
    if (!currentFen) return;
    navigator.clipboard.writeText(currentFen).then(() => {
      const prev = btnCopyFen.textContent;
      btnCopyFen.textContent = '✓ Copied!';
      setTimeout(() => {
        btnCopyFen.textContent = prev;
      }, 1200);
    });
  });

  // When switching tabs:
  // - If switching to a chess tab, immediately sync and update analysis.
  // - If switching to another tab (e.g. YouTube), keep existing analysis intact.
  if (chrome.tabs && chrome.tabs.onActivated) {
    chrome.tabs.onActivated.addListener(() => {
      fetchActiveBoardState(false);
      // Double-check after 200ms in case tab was waking up from background sleep
      setTimeout(() => fetchActiveBoardState(false), 200);
    });
  }

  // When tab navigates to a new URL
  if (chrome.tabs && chrome.tabs.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === 'complete' || changeInfo.url) {
        // If the active chess tab navigates away to a non-chess domain, clear
        if (tabId === lastChessTabId && changeInfo.url) {
          const isChess = changeInfo.url.includes('chess.com') || changeInfo.url.includes('lichess.org');
          if (!isChess) {
            clearBoardState('Navigated away from chess game.');
            return;
          }
        }
        fetchActiveBoardState(false);
      }
    });
  }

  // Only clear analysis if the user actually CLOSES the chess tab
  if (chrome.tabs && chrome.tabs.onRemoved) {
    chrome.tabs.onRemoved.addListener((closedTabId) => {
      if (closedTabId === lastChessTabId) {
        clearBoardState('Chess tab was closed.');
      }
    });
  }

  // Start engine and immediately poll active board
  initEngine();
  fetchActiveBoardState(false);
  setTimeout(() => fetchActiveBoardState(false), 500);
  setTimeout(() => fetchActiveBoardState(false), 1500);
  setTimeout(() => fetchActiveBoardState(false), 3000);
})();
