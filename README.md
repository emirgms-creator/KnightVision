# ♞ KnightVision - Chess AI HUD

<p align="center">
  <b>A minimalist, real-time chess board perception engine & HUD for study and bot training.</b><br>
  Built with Chrome Extensions Manifest V3, WebAssembly Stockfish, and zero DOM injection.
</p>

<p align="center">
  <img src="icons/icon128.png" width="96" height="96" alt="KnightVision Logo" />
</p>

---

## ⚡ Key Features

- **Isolated Side Panel HUD:**
  - Non-intrusive: Renders in Chrome's native Side Panel. Zero DOM modification or foreign elements on the target chessboard.
- **Client-Side Stockfish Engine:**
  - Powered by Stockfish compiled to WebAssembly / asm.js. Runs entirely offline in an isolated Web Worker without blocking your browser UI.
- **Real-Time Board Perception:**
  - Fast, event-driven DOM observer that maps chessboard states to standard **FEN** notation with millisecond latency.
  - Supports both **Chess.com** and **Lichess.org** (Live matches, Daily games, Puzzles, and Analysis boards).
- **Accurate Rules & Move Mechanics:**
  - Dynamic **en-passant** calculation and **castling rights** tracking via move history inspection.
- **Puzzle & Clockless Mode Detection:**
  - Intelligently determines active turn on puzzles and analysis setups where digital clocks are absent.
- **Continuous Dual-Side Analysis:**
  - Computes top engine recommendations regardless of whose turn it is (`White Move` vs `Black Move`), with clear role indicators (`(Your Turn)` vs `(Opponent's Move)`).
- **Perspective Lock & Auto-Detection:**
  - 3-way switcher (`AUTO`, `WHITE`, `BLACK`) ensures manual color choices are never overwritten by board flipping.
- **Engine Strength & Elo Throttling:**
  - Configurable Elo limits (1000 Elo Beginner to 3500 Elo Max) via native Stockfish UCI parameters (`UCI_LimitStrength`, `UCI_Elo`).
- **Alternative Variations (MultiPV):**
  - Displays top 3 candidate moves along with evaluation and depth statistics.
- **Clean Monochrome Aesthetic:**
  - High-contrast, dark terminal-inspired design without distracting neon effects or animations.

---

## 📥 Installation

1. **Clone or Download** this repository:
   ```bash
   git clone https://github.com/emirgms-creator/KnightVision.git
   ```
2. Open **Google Chrome** and navigate to:
   ```text
   chrome://extensions
   ```
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** (top-left) and select the `KnightVision` project directory (or extract `KnightVision.zip`).
5. Pin the **KnightVision** extension icon to your Chrome toolbar.

---

## 🎮 How to Use

1. Open a match, study board, or puzzle on [Chess.com](https://www.chess.com) or [Lichess.org](https://lichess.org).
2. Click the **KnightVision** icon in your Chrome toolbar to open the HUD in your Side Panel.
3. Choose your perspective: Leave on **AUTO** (automatically tracks board orientation) or click **WHITE** / **BLACK** to lock your perspective.
4. As moves are made, KnightVision automatically tracks the board, computes the best move, and updates the evaluation bar.

---

## 🏗️ Architecture

```
KnightVision/
├── manifest.json              # Chrome Manifest V3 configuration
├── icons/                     # Extension icons (16px, 48px, 128px)
├── src/
│   ├── background/
│   │   └── service_worker.js  # Side panel behavior manager
│   ├── content/
│   │   ├── board_parser.js    # DOM-to-FEN converter for Chess.com & Lichess
│   │   └── content.js         # MutationObserver event pipeline
│   ├── engine/
│   │   └── stockfish.js       # WebAssembly/asm.js Stockfish engine
│   └── sidepanel/
│       ├── sidepanel.html     # Minimalist HUD layout
│       ├── sidepanel.css      # Monochrome styling
│       └── sidepanel.js       # UCI protocol handler & UI renderer
```

---

## ⚠️ Disclaimer & Fair Play

**KnightVision is intended strictly for educational purposes, study boards, analysis, and games against AI bots.**

Online chess platforms (Chess.com, Lichess) strictly prohibit the use of chess engine assistance in rated multiplayer games against human opponents. Please respect platform fair-play rules.

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
The Stockfish chess engine is distributed under the GNU General Public License v3 (GPL-3.0).
