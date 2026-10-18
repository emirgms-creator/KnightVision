/**
 * Chess AI Assistant - Board Parser
 * Extracts the current board state from Chess.com and Lichess DOM into a standard FEN string.
 */

class ChessBoardParser {
  constructor() {
    this.turn = 'w';
    this.playerColor = 'w';
  }

  /**
   * Detects the platform and returns the current board state as FEN.
   */
  getBoardState() {
    // 1. Chess.com DOM (Custom elements <chess-board> / <wc-chess-board>)
    if (document.querySelector('chess-board, wc-chess-board, #board-layout-main, .board')) {
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
      // Ignore phantom / animating ghost pieces if opacity is 0 or display none
      if (el.classList.contains('animating') && (el.style.opacity === '0' || el.style.display === 'none')) return;

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
        const pieceChar = color === 'w' ? type : type.toLowerCase();

        // If square is already occupied, prefer non-animating piece
        if (!grid[row][col] || !el.classList.contains('animating')) {
          grid[row][col] = pieceChar;
        }
      }
    });

    // Detect last move highlights for turn detection and en-passant
    const lastMoveInfo = this.detectLastMoveChessCom(boardElement, grid);

    // Determine whose turn it is
    this.turn = lastMoveInfo.turn || this.detectTurnChessCom();

    // En-passant square
    const enPassant = lastMoveInfo.enPassant || '-';

    // Construct FEN position string
    const fenPosition = this.gridToFen(grid);
    const castling = this.estimateCastlingRights(grid, 'chess.com');
    const fullFEN = `${fenPosition} ${this.turn} ${castling} ${enPassant} 0 1`;

    return {
      fen: fullFEN,
      playerColor: this.playerColor,
      turn: this.turn,
      platform: 'chess.com'
    };
  }

  /**
   * Detects last move on Chess.com from .highlight squares for turn & en-passant.
   */
  detectLastMoveChessCom(boardElement, grid) {
    const highlights = boardElement.querySelectorAll('.highlight');
    if (!highlights || highlights.length < 2) {
      return { turn: null, enPassant: '-' };
    }

    const squares = [];
    highlights.forEach(hl => {
      hl.classList.forEach(cls => {
        const m = cls.match(/^square-(\d{2,4})$/);
        if (m) {
          const s = m[1];
          let file = 0, rank = 0;
          if (s.length === 2) {
            file = parseInt(s[0], 10);
            rank = parseInt(s[1], 10);
          } else if (s.length === 4) {
            file = parseInt(s.substring(0, 2), 10);
            rank = parseInt(s.substring(2, 4), 10);
          }
          if (file >= 1 && file <= 8 && rank >= 1 && rank <= 8) {
            squares.push({ file, rank, row: 8 - rank, col: file - 1 });
          }
        }
      });
    });

    if (squares.length < 2) return { turn: null, enPassant: '-' };

    // Find destination square (the one with a piece on it) and origin (empty or captured)
    const sq1 = squares[0];
    const sq2 = squares[1];
    const p1 = grid[sq1.row][sq1.col];
    const p2 = grid[sq2.row][sq2.col];

    let dest = null;
    let origin = null;

    if (p1 && !p2) {
      dest = { ...sq1, piece: p1 };
      origin = sq2;
    } else if (p2 && !p1) {
      dest = { ...sq2, piece: p2 };
      origin = sq1;
    } else if (p1 && p2) {
      // Both have pieces (can happen in pawn promotion or capture)
      dest = { ...sq2, piece: p2 };
      origin = sq1;
    }

    let turn = null;
    let enPassant = '-';

    if (dest && dest.piece) {
      const isWhitePiece = (dest.piece === dest.piece.toUpperCase());
      // If White piece moved, it is now Black's turn, and vice-versa
      turn = isWhitePiece ? 'b' : 'w';

      // Check en-passant: pawn moved 2 squares along same file
      if (origin && origin.file === dest.file && Math.abs(origin.rank - dest.rank) === 2) {
        if (dest.piece.toUpperCase() === 'P') {
          const epRank = Math.round((origin.rank + dest.rank) / 2);
          const epFileChar = String.fromCharCode(96 + dest.file);
          enPassant = `${epFileChar}${epRank}`;
        }
      }
    }

    return { turn, enPassant };
  }

  /**
   * Parses Lichess DOM structure.
   */
  parseLichess() {
    const cgBoard = document.querySelector('cg-board');
    if (!cgBoard) return null;

    // Detect orientation: Chessground adds .orientation-black when flipped
    let isFlipped = false;
    const cgWrap = document.querySelector('.cg-wrap, cg-container, cg-board');
    if (cgWrap && cgWrap.classList.contains('orientation-black')) {
      isFlipped = true;
    } else if (document.querySelector('.orientation-black, [class*="orientation-black"]')) {
      isFlipped = true;
    }
    this.playerColor = isFlipped ? 'b' : 'w';

    const rect = cgBoard.getBoundingClientRect();
    const boardWidth = (rect && rect.width > 0) ? rect.width : (cgBoard.clientWidth || cgBoard.offsetWidth || 512);
    const squareSize = boardWidth / 8;

    const grid = Array(8).fill(null).map(() => Array(8).fill(''));
    const pieces = document.querySelectorAll('cg-board piece, .cg-wrap piece');
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

      // Extract coordinates from inline transform or computed matrix
      const inlineTransform = el.style.transform || '';
      const computedTransform = (typeof window !== 'undefined' && window.getComputedStyle) ? window.getComputedStyle(el).transform : '';
      const transform = inlineTransform || computedTransform;

      if (transform && transform !== 'none') {
        let col = -1;
        let row = -1;

        // Pattern 1: translate(Xpx, Ypx) or translate3d(Xpx, Ypx, 0)
        const matchPx = transform.match(/translate(?:3d)?\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px/i);
        // Pattern 2: matrix(a, b, c, d, tx, ty)
        const matchMat = transform.match(/matrix\(\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/i);
        // Pattern 3: translate(X%, Y%)
        const matchPct = transform.match(/translate(?:3d)?\(\s*(-?[\d.]+)%\s*,\s*(-?[\d.]+)%/i);

        if (matchPx) {
          col = Math.round(parseFloat(matchPx[1]) / squareSize);
          row = Math.round(parseFloat(matchPx[2]) / squareSize);
        } else if (matchMat) {
          col = Math.round(parseFloat(matchMat[1]) / squareSize);
          row = Math.round(parseFloat(matchMat[2]) / squareSize);
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

    // Detect last move highlights for turn detection and en-passant on Lichess
    const lastMoveInfo = this.detectLastMoveLichess(cgBoard, grid, squareSize, isFlipped);

    this.turn = lastMoveInfo.turn || this.detectTurnLichess();
    const enPassant = lastMoveInfo.enPassant || '-';

    const fenPosition = this.gridToFen(grid);
    const castling = this.estimateCastlingRights(grid, 'lichess');
    const fullFEN = `${fenPosition} ${this.turn} ${castling} ${enPassant} 0 1`;

    return {
      fen: fullFEN,
      playerColor: this.playerColor,
      turn: this.turn,
      platform: 'lichess'
    };
  }

  /**
   * Detects last move on Lichess from square.last-move elements for turn & en-passant.
   */
  detectLastMoveLichess(cgBoard, grid, squareSize, isFlipped) {
    const lastMoveSquares = cgBoard.querySelectorAll('square.last-move');
    if (!lastMoveSquares || lastMoveSquares.length < 2) {
      return { turn: null, enPassant: '-' };
    }

    const squares = [];
    lastMoveSquares.forEach(el => {
      const transform = el.style.transform || (window.getComputedStyle ? window.getComputedStyle(el).transform : '');
      if (transform && transform !== 'none') {
        const matchPx = transform.match(/translate(?:3d)?\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px/i);
        const matchPct = transform.match(/translate(?:3d)?\(\s*(-?[\d.]+)%\s*,\s*(-?[\d.]+)%/i);
        let col = -1, row = -1;

        if (matchPx) {
          col = Math.round(parseFloat(matchPx[1]) / squareSize);
          row = Math.round(parseFloat(matchPx[2]) / squareSize);
        } else if (matchPct) {
          col = Math.round(parseFloat(matchPct[1]) / 12.5);
          row = Math.round(parseFloat(matchPct[2]) / 12.5);
        }

        if (col >= 0 && col < 8 && row >= 0 && row < 8) {
          if (isFlipped) {
            col = 7 - col;
            row = 7 - row;
          }
          const file = col + 1;
          const rank = 8 - row;
          squares.push({ file, rank, row, col });
        }
      }
    });

    if (squares.length < 2) return { turn: null, enPassant: '-' };

    const sq1 = squares[0];
    const sq2 = squares[1];
    const p1 = grid[sq1.row][sq1.col];
    const p2 = grid[sq2.row][sq2.col];

    let dest = null;
    let origin = null;

    if (p1 && !p2) {
      dest = { ...sq1, piece: p1 };
      origin = sq2;
    } else if (p2 && !p1) {
      dest = { ...sq2, piece: p2 };
      origin = sq1;
    } else if (p1 && p2) {
      dest = { ...sq2, piece: p2 };
      origin = sq1;
    }

    let turn = null;
    let enPassant = '-';

    if (dest && dest.piece) {
      const isWhitePiece = (dest.piece === dest.piece.toUpperCase());
      turn = isWhitePiece ? 'b' : 'w';

      // Check en-passant
      if (origin && origin.file === dest.file && Math.abs(origin.rank - dest.rank) === 2) {
        if (dest.piece.toUpperCase() === 'P') {
          const epRank = Math.round((origin.rank + dest.rank) / 2);
          const epFileChar = String.fromCharCode(96 + dest.file);
          enPassant = `${epFileChar}${epRank}`;
        }
      }
    }

    return { turn, enPassant };
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
   * Estimates remaining castling rights from piece placement and move history.
   */
  estimateCastlingRights(grid, platform = '') {
    let castling = '';
    const whiteKingOnE1 = (grid[7][4] === 'K');
    const blackKingOnE8 = (grid[0][4] === 'k');

    // Parse move history text to see if kings or rooks moved
    const moveHistoryText = this.getMoveHistoryText(platform);

    let whiteCanCastle = whiteKingOnE1;
    let blackCanCastle = blackKingOnE8;

    if (moveHistoryText) {
      // If White played any King move or castle, White cannot castle anymore
      if (/\b(?:K[a-h1-8x]|O-O|O-O-O)\b/.test(moveHistoryText.whiteMoves)) {
        whiteCanCastle = false;
      }
      // If Black played any King move or castle, Black cannot castle anymore
      if (/\b(?:K[a-h1-8x]|O-O|O-O-O)\b/i.test(moveHistoryText.blackMoves)) {
        blackCanCastle = false;
      }
    }

    // White castling rights
    if (whiteCanCastle) {
      if (grid[7][7] === 'R' && (!moveHistoryText || !/\bRh1\b|\bR[a-h]1\b/.test(moveHistoryText.whiteMoves))) {
        castling += 'K';
      }
      if (grid[7][0] === 'R' && (!moveHistoryText || !/\bRa1\b|\bR[a-h]1\b/.test(moveHistoryText.whiteMoves))) {
        castling += 'Q';
      }
    }

    // Black castling rights
    if (blackCanCastle) {
      if (grid[0][7] === 'r' && (!moveHistoryText || !/\brh8\b|\br[a-h]8\b/i.test(moveHistoryText.blackMoves))) {
        castling += 'k';
      }
      if (grid[0][0] === 'r' && (!moveHistoryText || !/\bra8\b|\br[a-h]8\b/i.test(moveHistoryText.blackMoves))) {
        castling += 'q';
      }
    }

    return castling || '-';
  }

  /**
   * Extracts move history text for White and Black
   */
  getMoveHistoryText(platform) {
    try {
      let whiteMoves = '';
      let blackMoves = '';

      if (platform === 'chess.com') {
        const rows = document.querySelectorAll('.move-list-row, .vertical-move-list-row, tr.row');
        rows.forEach(r => {
          const nodes = r.querySelectorAll('.node:not(.empty)');
          if (nodes[0]) whiteMoves += ' ' + nodes[0].textContent.trim();
          if (nodes[1]) blackMoves += ' ' + nodes[1].textContent.trim();
        });
      } else if (platform === 'lichess') {
        const moves = document.querySelectorAll('l4x > u8t, rm6 > san, .moves > move');
        moves.forEach((m, idx) => {
          const txt = m.textContent.trim();
          if (idx % 2 === 0) whiteMoves += ' ' + txt;
          else blackMoves += ' ' + txt;
        });
      }

      return { whiteMoves, blackMoves };
    } catch (e) {
      return null;
    }
  }

  /**
   * Detects active turn on Chess.com via move history or clock highlights.
   */
  /**
   * Detects active turn on Chess.com via puzzle detection, move history, clocks, or board orientation.
   */
  detectTurnChessCom() {
    // 0. Puzzle Mode Detection (URL or DOM indicators)
    const isPuzzle = window.location.pathname.includes('/puzzle') ||
                     window.location.pathname.includes('/daily-puzzle') ||
                     document.querySelector('.board-layout-puzzle, [data-puzzle], .puzzle-layout, #puzzle-board, [class*="puzzle"]') !== null;

    if (isPuzzle) {
      // Priority A: Explicit text on page (e.g. "Black to move", "White to play")
      const bodyText = document.body ? document.body.innerText : '';
      if (/\b(?:black\s+(?:to\s+(?:move|play)|'s\s+turn)|find\s+the\s+best\s+move\s+for\s+black)\b/i.test(bodyText)) {
        return 'b';
      }
      if (/\b(?:white\s+(?:to\s+(?:move|play)|'s\s+turn)|find\s+the\s+best\s+move\s+for\s+white)\b/i.test(bodyText)) {
        return 'w';
      }
      // Priority B: In puzzle mode, user is solver and board is oriented to user's perspective
      return this.playerColor; // 'b' if flipped, 'w' if normal
    }

    // 1. Check selected / active move node in analysis or review mode
    const selectedNode = document.querySelector('.move-list-row .node.selected, .vertical-move-list .node.selected, .game-controls-history .node.selected');
    if (selectedNode) {
      const parentRow = selectedNode.closest('.move-list-row, .vertical-move-list-row, tr.row');
      if (parentRow) {
        const nodes = parentRow.querySelectorAll('.node:not(.empty)');
        if (nodes.length > 0) {
          // If the selected node is the first node (White's move), it is now Black's turn
          if (nodes[0] === selectedNode) return 'b';
          // If the selected node is the second node (Black's move), it is now White's turn
          if (nodes[1] === selectedNode) return 'w';
        }
      }
    }

    // 2. Check total move list items
    const moveNodes = document.querySelectorAll('.move-list-row .node:not(.empty), .vertical-move-list .node:not(.empty)');
    if (moveNodes.length > 0) {
      return (moveNodes.length % 2 === 1) ? 'b' : 'w';
    }

    // 3. Fallback: Check active clocks
    const bottomClockActive = document.querySelector('.player-bottom .clock-player-turn, .bottom .clock-player-turn, .player-bottom [class*="clock-active"]');
    const topClockActive = document.querySelector('.player-top .clock-player-turn, .top .clock-player-turn, .player-top [class*="clock-active"]');

    if (bottomClockActive) {
      return this.playerColor; // It's bottom player's turn
    } else if (topClockActive) {
      return this.playerColor === 'w' ? 'b' : 'w';
    }

    // 4. Fallback to board orientation perspective
    return this.playerColor || 'w';
  }

  /**
   * Detects active turn on Lichess via puzzle detection, analysis nodes, notation tree, or clocks.
   */
  detectTurnLichess() {
    // 0. Puzzle Mode Detection (URL or DOM indicators)
    const isPuzzle = window.location.pathname.includes('/training') ||
                     window.location.pathname.includes('/practice') ||
                     window.location.pathname.includes('/storm') ||
                     window.location.pathname.includes('/streak') ||
                     document.querySelector('.puzzle__app, .puzzle__tools, .puzzle__side, .training__app') !== null;

    if (isPuzzle) {
      // Priority A: Explicit color icon or text in Lichess puzzle UI
      if (document.querySelector('.puzzle__side .color-icon.black, .puzzle__side .black, .puzzle__meta .black, .puzzle__feedback.black')) {
        return 'b';
      }
      if (document.querySelector('.puzzle__side .color-icon.white, .puzzle__side .white, .puzzle__meta .white, .puzzle__feedback.white')) {
        return 'w';
      }
      const bodyText = document.body ? document.body.innerText : '';
      if (/\bblack\s+to\s+move\b/i.test(bodyText)) return 'b';
      if (/\bwhite\s+to\s+move\b/i.test(bodyText)) return 'w';

      // Priority B: In puzzle mode, the board is oriented to user's perspective
      return this.playerColor; // 'b' if flipped, 'w' if normal
    }

    // 1. Check selected / active move node in analysis mode
    const activeMove = document.querySelector('l4x > u8t.active, .tview2 > move.active, .moves > move.active');
    if (activeMove) {
      const allActiveMoves = document.querySelectorAll('l4x > u8t, .tview2 > move, .moves > move');
      const idx = Array.from(allActiveMoves).indexOf(activeMove);
      if (idx !== -1) {
        // Even index (0, 2, ...) means White just played -> Black's turn
        return (idx % 2 === 0) ? 'b' : 'w';
      }
    }

    // 2. Distinct move count from notation tree (strictly count single moves, avoid duplicate san/u8t count)
    const moveNodes = document.querySelectorAll('l4x > u8t, rm6 > san, .moves > move, .tview2 > move, .game__moves > move');
    if (moveNodes && moveNodes.length > 0) {
      return (moveNodes.length % 2 === 1) ? 'b' : 'w';
    }

    // 3. Active running clocks
    const bottomRunning = document.querySelector('.ruser-bottom .rclock-running, .rclock-bottom.running, .rclock-bottom.active');
    const topRunning = document.querySelector('.ruser-top .rclock-running, .rclock-top.running, .rclock-top.active');
    if (bottomRunning) return this.playerColor;
    if (topRunning) return this.playerColor === 'w' ? 'b' : 'w';

    // 4. User indicator / turn class
    const turnBottom = document.querySelector('.ruser-bottom.turn, .round__app .ruser-bottom.turn, .ruser-bottom.active');
    const turnTop = document.querySelector('.ruser-top.turn, .round__app .ruser-top.turn, .ruser-top.active');
    if (turnBottom) return this.playerColor;
    if (turnTop) return this.playerColor === 'w' ? 'b' : 'w';

    // 5. Default fallback to board orientation
    return this.playerColor || 'w';
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
    const castling = this.estimateCastlingRights(grid, 'generic');
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
