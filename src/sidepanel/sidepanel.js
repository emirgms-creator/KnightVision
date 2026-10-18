/**
 * KnightVision - Clean Monochrome Side Panel Controller
 * Real-time chess board perception and Stockfish engine analysis.
 */

(function () {
  let engine = null;
  let isEngineReady = false;
  let currentFen = '';
  let activeTurn = 'w';     // 'w' or 'b'
  let playerColor = 'w';    // 'w' or 'b' (User's chosen color)
  let thinkingTime = 1000;
  let currentElo = 'max';
  let multiPVLines = {};

  // DOM Elements
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
      const mateMoves = parseInt(mateMatch[1], 10);
      scoreDisplay = `M${mateMoves > 0 ? '+' : ''}${mateMoves}`;
      numericScore = mateMoves > 0 ? 100 : -100;
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
    const isWhiteTurn = (activeTurn === 'w');
    const colorKey = isWhiteTurn ? 'w' : 'b';

    const piece = PIECE_CONFIG[colorKey][pieceLetter] || {
      name: isWhiteTurn ? 'White Piece' : 'Black Piece',
      icon: isWhiteTurn ? '♙' : '♟'
    };

    // Styling according to active side
    if (isWhiteTurn) {
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
    bestMoveText.textContent = `${fromSquare.toUpperCase()} ➔ ${toSquare.toUpperCase()}`;

    let desc = `${piece.name} to ${toSquare.toUpperCase()}`;
    if (promotion) {
      desc += ` (Promote to Queen)`;
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
      if (!line || !line.move) return;

      const item = document.createElement('div');
      item.className = 'alt-item';
      item.innerHTML = `
        <div>
          <span class="alt-rank">#${key}</span>
          <span class="alt-move">${line.move.substring(0, 2).toUpperCase()} ➔ ${line.move.substring(2, 4).toUpperCase()}</span>
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
   * Sets user's active color perspective
   */
  function setPlayerColor(color) {
    playerColor = color;
    if (color === 'w') {
      btnChooseWhite.classList.add('active');
      btnChooseBlack.classList.remove('active');
    } else {
      btnChooseBlack.classList.add('active');
      btnChooseWhite.classList.remove('active');
    }
    // Update role badge for current move
    const isUserTurn = (activeTurn === playerColor);
    moveRoleBadge.textContent = isUserTurn ? '(Your Turn)' : "(Opponent's Move)";
  }

  /**
   * Trigger Stockfish analysis
   */
  function analyzePosition(fen) {
    if (!engine || !isEngineReady || !fen) return;

    currentFen = fen;
    fenInput.value = fen;
    multiPVLines = {};

    engine.postMessage('stop');
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
        setPlayerColor(data.playerColor);
      }

      // Always continuously compute best move regardless of turn
      analyzePosition(data.fen);
    }
  });

  /**
   * User Controls
   */
  btnChooseWhite.addEventListener('click', () => {
    setPlayerColor('w');
  });

  btnChooseBlack.addEventListener('click', () => {
    setPlayerColor('b');
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

  btnScan.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0] || !tabs[0].id) return;
      chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_BOARD_STATE' }, (response) => {
        if (chrome.runtime.lastError) {
          // Suppress unchecked runtime error if not on a chess page
          bestMoveText.textContent = '-- ➔ --';
          moveDesc.textContent = 'Open a game on Chess.com or Lichess.';
          return;
        }
        if (response && response.fen) {
          activeTurn = response.turn;
          if (response.playerColor) {
            setPlayerColor(response.playerColor);
          }
          analyzePosition(response.fen);
        } else {
          bestMoveText.textContent = '-- ➔ --';
          moveDesc.textContent = 'Chess board not detected on this page.';
        }
      });
    });
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

  // Start engine
  initEngine();
})();
