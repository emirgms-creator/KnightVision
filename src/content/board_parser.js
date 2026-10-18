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
    const cgContainer = document.querySelector('cg-container, .round__app cg-board');
    if (!cgContainer) return null;

    const isFlipped = document.querySelector('.orientation-black, cg-board.orientation-black') !== null;
    this.playerColor = isFlipped ? 'b' : 'w';

    const grid = Array(8).fill(null).map(() => Array(8).fill(''));
    const pieces = document.querySelectorAll('cg-board piece');

    pieces.forEach(el => {
      let pieceChar = '';
      const classes = Array.from(el.classList);
      const isWhite = classes.includes('white');
      const isBlack = classes.includes('black');

      let type = '';
      if (classes.includes('pawn')) type = 'P';
      else if (classes.includes('knight')) type = 'N';
      else if (classes.includes('bishop')) type = 'B';
      else if (classes.includes('rook')) type = 'R';
      else if (classes.includes('queen')) type = 'Q';
      else if (classes.includes('king')) type = 'K';

      if (!type) return;
      pieceChar = isWhite ? type : type.toLowerCase();

      // Check cg-key attribute or transform
      const key = el.getAttribute('cg-key') || el.parentElement?.getAttribute('cg-key');
      if (key && key.length === 2) {
        const col = key.charCodeAt(0) - 97; // a -> 0
        const row = 8 - parseInt(key[1], 10);
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
    const bottomRunning = document.querySelector('.ruser-bottom .rclock-running');
    const topRunning = document.querySelector('.ruser-top .rclock-running');
    if (bottomRunning) return this.playerColor;
    if (topRunning) return this.playerColor === 'w' ? 'b' : 'w';
    return 'w';
  }
}

// Export for extension and testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChessBoardParser;
} else {
  window.ChessBoardParser = ChessBoardParser;
}
