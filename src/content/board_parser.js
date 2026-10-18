/**
 * Chess AI Assistant - Board Parser
 * Extracts the current board state from Chess.com and Lichess DOM into a standard FEN string.
 */

class ChessBoardParser {
  constructor() {
    this.lastFEN = '';
    this.turn = 'w';
    this.playerColor = 'w';
  }

  /**
   * Detects the platform and returns the current board state as FEN.
   */
  getBoardState() {
    // 1. Chess.com DOM (Custom elements <chess-board> / <wc-chess-board>)
    if (document.querySelector('chess-board, wc-chess-board, #board-layout-main')) {
      const state = this.parseChessCom();
      if (state) return state;
    }

    // 2. Lichess DOM (<cg-board> / Chessground)
    if (document.querySelector('cg-board, cg-container')) {
      const state = this.parseLichess();
      if (state) return state;
    }

    // 3. Chessboard.js / FIDE Online Arena / PyChess / Generic Square Boards
    const genericState = this.parseChessboardJs();
    if (genericState) return genericState;

    // Fallbacks if hostname matches
    if (window.location.hostname.includes('chess.com')) {
      return this.parseChessCom();
    } else if (window.location.hostname.includes('lichess.org')) {
      return this.parseLichess();
    }
    return null;
  }

  /**
   * Parses Chess.com DOM structure.
   */
  parseChessCom() {
    const boardElement = document.querySelector('chess-board, wc-chess-board, #board-layout-main, .board');
    if (!boardElement) return null;

    // Detect user perspective (is board flipped?)
    const isFlipped = boardElement.classList.contains('flipped') || 
                      document.querySelector('.board.flipped') !== null;
    this.playerColor = isFlipped ? 'b' : 'w';

    // 8x8 matrix (0,0 is a8, 7,7 is h1)
    const grid = Array(8).fill(null).map(() => Array(8).fill(''));

    // Find all piece elements
    const pieceElements = boardElement.querySelectorAll('.piece');
    if (!pieceElements || pieceElements.length === 0) return null;

    pieceElements.forEach(el => {
      // Ignore phantom / animating ghost pieces if any
      if (el.classList.contains('animating') && el.style.opacity === '0') return;

      let pieceType = '';
      let squareCoord = null;

      // Extract piece type and square from class names (e.g. "piece wp square-52")
      el.classList.forEach(cls => {
        // Piece type: wp, wn, wb, wr, wq, wk, bp, bn, bb, br, bq, bk
        if (/^[wb][pnbrqk]$/.test(cls)) {
          pieceType = cls;
        }
        // Square coordinate: square-52, square-0502, square-e4
        const sqMatch = cls.match(/^square-(\d{2,4})$/);
        if (sqMatch) {
          squareCoord = sqMatch[1];
        }
      });

      if (!pieceType || !squareCoord) return;

      // Parse coordinates
      let file = 0; // 1 (a) to 8 (h)
      let rank = 0; // 1 (1) to 8 (8)

      if (squareCoord.length === 2) {
        file = parseInt(squareCoord[0], 10);
        rank = parseInt(squareCoord[1], 10);
      } else if (squareCoord.length === 4) {
        file = parseInt(squareCoord.substring(0, 2), 10);
        rank = parseInt(squareCoord.substring(2, 4), 10);
      }

      if (file >= 1 && file <= 8 && rank >= 1 && rank <= 8) {
        const row = 8 - rank; // 8th rank is row 0, 1st rank is row 7
        const col = file - 1; // 'a' is col 0, 'h' is col 7

        const color = pieceType[0];
        const type = pieceType[1].toUpperCase();
        grid[row][col] = color === 'w' ? type : type.toLowerCase();
      }
    });

    // Determine whose turn it is
    this.turn = this.detectTurnChessCom();

    // Construct FEN position string
    const fenPosition = this.gridToFen(grid);
    const castling = this.estimateCastlingRights(grid);
    const fullFEN = `${fenPosition} ${this.turn} ${castling} - 0 1`;

    return {
      fen: fullFEN,
      playerColor: this.playerColor,
      turn: this.turn,
      platform: 'chess.com'
    };
  }

  /**
   * Parses Lichess DOM structure.
   */
  parseLichess() {
    const cgBoard = document.querySelector('cg-board');
    if (!cgBoard) return null;

    const isFlipped = document.querySelector('.orientation-black, cg-board.orientation-black, .cg-wrap.orientation-black') !== null;
    this.playerColor = isFlipped ? 'b' : 'w';

    const rect = cgBoard.getBoundingClientRect();
    const boardWidth = rect.width || cgBoard.clientWidth || cgBoard.offsetWidth;
    if (!boardWidth || boardWidth <= 0) return null;
    const squareSize = boardWidth / 8;

    const grid = Array(8).fill(null).map(() => Array(8).fill(''));
    const pieces = cgBoard.querySelectorAll('piece');
    if (!pieces || pieces.length === 0) return null;

    pieces.forEach(el => {
      // Ignore animation ghost/dragging copies
      if (el.classList.contains('ghost') || el.classList.contains('dragging')) return;

      const isWhite = el.classList.contains('white');
      const isBlack = el.classList.contains('black');
      if (!isWhite && !isBlack) return;

      let type = '';
      if (el.classList.contains('pawn')) type = 'P';
      else if (el.classList.contains('knight')) type = 'N';
      else if (el.classList.contains('bishop')) type = 'B';
      else if (el.classList.contains('rook')) type = 'R';
      else if (el.classList.contains('queen')) type = 'Q';
      else if (el.classList.contains('king')) type = 'K';
      if (!type) return;

      const pieceChar = isWhite ? type : type.toLowerCase();

      // Priority 1: CSS transform translate(Xpx, Ypx) or translate3d(Xpx, Ypx, 0)
      const transform = el.style.transform;
      if (transform) {
        const matchPx = transform.match(/translate(?:3d)?\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px/);
        const matchPct = transform.match(/translate(?:3d)?\(\s*(-?[\d.]+)%\s*,\s*(-?[\d.]+)%/);

        let col = -1;
        let row = -1;

        if (matchPx) {
          const x = parseFloat(matchPx[1]);
          const y = parseFloat(matchPx[2]);
          col = Math.round(x / squareSize);
          row = Math.round(y / squareSize);
        } else if (matchPct) {
          col = Math.round(parseFloat(matchPct[1]) / 12.5);
          row = Math.round(parseFloat(matchPct[2]) / 12.5);
        }

        if (col >= 0 && col < 8 && row >= 0 && row < 8) {
          if (isFlipped) {
            col = 7 - col;
            row = 7 - row;
          }
          grid[row][col] = pieceChar;
          return;
        }
      }

      // Priority 2: cg-key fallback (e.g. cg-key="e4")
      const key = el.getAttribute('cg-key') || el.parentElement?.getAttribute('cg-key');
      if (key && key.length === 2) {
        const col = key.charCodeAt(0) - 97;
        const rank = parseInt(key[1], 10);
        const row = 8 - rank;
        if (row >= 0 && row < 8 && col >= 0 && col < 8) {
          grid[row][col] = pieceChar;
        }
      }
    });

    this.turn = this.detectTurnLichess();
    const fenPosition = this.gridToFen(grid);
    const castling = this.estimateCastlingRights(grid);
    const fullFEN = `${fenPosition} ${this.turn} ${castling} - 0 1`;

    return {
      fen: fullFEN,
      playerColor: this.playerColor,
      turn: this.turn,
      platform: 'lichess'
    };
  }

  /**
   * Converts an 8x8 matrix to standard FEN piece placement string.
   */
  gridToFen(grid) {
    const rows = [];
    for (let r = 0; r < 8; r++) {
      let emptyCount = 0;
      let rowStr = '';
      for (let c = 0; c < 8; c++) {
        const val = grid[r][c];
        if (!val) {
          emptyCount++;
        } else {
          if (emptyCount > 0) {
            rowStr += emptyCount;
            emptyCount = 0;
          }
          rowStr += val;
        }
      }
      if (emptyCount > 0) {
        rowStr += emptyCount;
      }
      rows.push(rowStr);
    }
    return rows.join('/');
  }

  /**
   * Estimates remaining castling rights from piece placement.
   */
  estimateCastlingRights(grid) {
    let castling = '';
    // White: King on e1 (row 7, col 4)
    if (grid[7][4] === 'K') {
      if (grid[7][7] === 'R') castling += 'K';
      if (grid[7][0] === 'R') castling += 'Q';
    }
    // Black: King on e8 (row 0, col 4)
    if (grid[0][4] === 'k') {
      if (grid[0][7] === 'r') castling += 'k';
      if (grid[0][0] === 'r') castling += 'q';
    }
    return castling || '-';
  }

  /**
   * Detects active turn on Chess.com via move history or clock highlights.
   */
  detectTurnChessCom() {
    // 1. Check move list items
    const moveNodes = document.querySelectorAll('.move-list-row, .vertical-move-list .node, .game-controls-history .node');
    if (moveNodes.length > 0) {
      const allMoves = document.querySelectorAll('.vertical-move-list .node:not(.empty), .move-list .node:not(.empty)');
      if (allMoves.length > 0) {
        const count = allMoves.length;
        // Odd number of half-moves means White just moved -> Black's turn
        return (count % 2 === 1) ? 'b' : 'w';
      }
    }

    // 2. Fallback: Check active clocks
    const bottomClockActive = document.querySelector('.player-bottom .clock-player-turn, .bottom .clock-player-turn');
    const topClockActive = document.querySelector('.player-top .clock-player-turn, .top .clock-player-turn');

    if (bottomClockActive) {
      return this.playerColor; // It's bottom player's turn
    } else if (topClockActive) {
      return this.playerColor === 'w' ? 'b' : 'w';
    }

    // Default to white
    return 'w';
  }

  /**
   * Detects active turn on Lichess.
   */
  detectTurnLichess() {
    // 1. Move count from notation tree (l4x, .moves, .tview2, rm6)
    const moveNodes = document.querySelectorAll('l4x move, .moves move, .tview2 move, rm6 move, .game__moves move');
    if (moveNodes && moveNodes.length > 0) {
      return (moveNodes.length % 2 === 1) ? 'b' : 'w';
    }

    // 2. Active running clocks
    const bottomRunning = document.querySelector('.ruser-bottom .rclock-running, .rclock-bottom.running, .rclock-bottom.active');
    const topRunning = document.querySelector('.ruser-top .rclock-running, .rclock-top.running, .rclock-top.active');
    if (bottomRunning) return this.playerColor;
    if (topRunning) return this.playerColor === 'w' ? 'b' : 'w';

    // 3. User indicator / turn class
    const turnBottom = document.querySelector('.ruser-bottom.turn, .round__app .ruser-bottom.turn, .ruser-bottom.active');
    const turnTop = document.querySelector('.ruser-top.turn, .round__app .ruser-top.turn, .ruser-top.active');
    if (turnBottom) return this.playerColor;
    if (turnTop) return this.playerColor === 'w' ? 'b' : 'w';

    return 'w';
  }

  /**
   * Parses Chessboard.js and standard square-based DOM boards (FIDE Online Arena, PyChess, ChessBase, etc.)
   */
  parseChessboardJs() {
    // Look for squares with data-square or square-[a-h][1-8]
    const squareElements = document.querySelectorAll('[data-square], [class*="square-"]');
    if (!squareElements || squareElements.length < 16) return null;

    // Detect orientation
    const isFlipped = document.querySelector('.orientation-black, [class*="black-orientation"], [class*="flipped"]') !== null;
    this.playerColor = isFlipped ? 'b' : 'w';

    const grid = Array(8).fill(null).map(() => Array(8).fill(''));
    let piecesFound = 0;

    squareElements.forEach(sq => {
      // Get square name (e.g. "a1", "e4")
      let sqName = sq.getAttribute('data-square');
      if (!sqName || !/^[a-h][1-8]$/.test(sqName)) {
        if (sq.classList && sq.classList.forEach) {
          sq.classList.forEach(cls => {
            const match = cls.match(/^square-([a-h][1-8])$/);
            if (match) sqName = match[1];
          });
        }
      }
      if (!sqName || !/^[a-h][1-8]$/.test(sqName)) return;

      const col = sqName.charCodeAt(0) - 97;
      const rank = parseInt(sqName[1], 10);
      const row = 8 - rank;

      // Find piece inside square (image, div, svg)
      const pieceEl = sq.querySelector('img, div[class*="piece"], svg[class*="piece"]');
      if (!pieceEl) return;

      let pieceChar = '';

      // Priority 1: data-piece attribute (e.g. data-piece="wK", data-piece="bP")
      const dataPiece = pieceEl.getAttribute('data-piece') || sq.getAttribute('data-piece');
      if (dataPiece && /^[wb][pnbrqk]$/i.test(dataPiece)) {
        const color = dataPiece[0].toLowerCase();
        const type = dataPiece[1].toUpperCase();
        pieceChar = color === 'w' ? type : type.toLowerCase();
      }

      // Priority 2: Image src attribute (e.g. .../wK.png, .../bN.svg, .../wP.webp)
      if (!pieceChar && pieceEl.tagName === 'IMG') {
        const src = pieceEl.src || pieceEl.getAttribute('src') || '';
        const match = src.match(/(?:^|[\/_-])([wb])([pnbrqk])\.(?:png|svg|webp|gif)/i);
        if (match) {
          const color = match[1].toLowerCase();
          const type = match[2].toUpperCase();
          pieceChar = color === 'w' ? type : type.toLowerCase();
        }
      }

      // Priority 3: Class names (e.g. piece-wK, piece-bP)
      if (!pieceChar && pieceEl.classList && pieceEl.classList.forEach) {
        pieceEl.classList.forEach(cls => {
          const match = cls.match(/(?:^|\b)(?:piece-)?([wb])([pnbrqk])(?:\b|$)/i);
          if (match) {
            const color = match[1].toLowerCase();
            const type = match[2].toUpperCase();
            pieceChar = color === 'w' ? type : type.toLowerCase();
          }
        });
      }

      if (pieceChar && row >= 0 && row < 8 && col >= 0 && col < 8) {
        grid[row][col] = pieceChar;
        piecesFound++;
      }
    });

    if (piecesFound < 2) return null; // Not enough pieces to be a valid chess board

    this.turn = this.detectTurnGeneric();
    const fenPosition = this.gridToFen(grid);
    const castling = this.estimateCastlingRights(grid);
    const fullFEN = `${fenPosition} ${this.turn} ${castling} - 0 1`;

    return {
      fen: fullFEN,
      playerColor: this.playerColor,
      turn: this.turn,
      platform: 'generic'
    };
  }

  /**
   * Generic turn detector from move notation lists
   */
  detectTurnGeneric() {
    const moveNodes = document.querySelectorAll('.moves move, .move-list .node, .game-moves .move, .history tr, .notation-move');
    if (moveNodes && moveNodes.length > 0) {
      return (moveNodes.length % 2 === 1) ? 'b' : 'w';
    }
    return 'w';
  }
}

// Export for extension and testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChessBoardParser;
} else {
  window.ChessBoardParser = ChessBoardParser;
}
