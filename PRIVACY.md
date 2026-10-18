# Privacy Policy for KnightVision - Chess AI HUD

**Last Updated:** October 18, 2026

KnightVision ("the Extension") is committed to protecting your privacy. This Privacy Policy explains our practices regarding user data and information collection.

---

## 1. Single Purpose and Overview
KnightVision is an open-source browser extension designed solely as an educational companion and analysis HUD for chess study on supported platforms (such as Chess.com and Lichess.org). It operates completely client-side via a WebAssembly-compiled Stockfish engine running locally in your browser.

---

## 2. Information We Do NOT Collect
KnightVision follows a strict zero-data-collection policy:
- **No Personal Information:** We do not collect names, email addresses, usernames, passwords, IP addresses, or contact information.
- **No Browsing History:** We do not track, record, or analyze your browsing activity, history, or bookmarks.
- **No Game History Logging:** We do not store or transmit your chess games, move records, or opponent profiles to any remote server.
- **No Third-Party Analytics:** We do not use Google Analytics, cookies, tracking pixels, or advertising SDKs.
- **No Account Required:** You do not need an account, login, or subscription to use KnightVision.

---

## 3. How the Extension Works (Local Processing Only)
- **Local Engine Execution:** The Stockfish chess engine runs entirely offline within a local Web Worker inside your browser. No move analysis is sent over the internet.
- **DOM Perception:** When active on supported chess pages (Chess.com and Lichess.org), the extension reads the visual placement of chessboard elements strictly in memory to construct a local FEN string.
- **Local Settings Storage:** User preferences (e.g., chosen Elo strength, thinking time, and board perspective) are stored locally on your device via Chrome's native `chrome.storage.local` API and never leave your computer.

---

## 4. Permissions Explanation
KnightVision requests only the minimum necessary permissions required for its functionality:
- `sidePanel`: Required to render the analysis HUD inside Chrome's native side panel without altering the webpage layout.
- `tabs` & `activeTab`: Used solely to detect when the active tab switches or closes so the side panel HUD can synchronize with the active game.
- `storage`: Used solely to save your local UI preferences (Elo level, perspective lock) on your device.
- `host_permissions` (`*://*.chess.com/*`, `*://*.lichess.org/*`): Required to observe chessboard layout changes on supported chess study platforms.

---

## 5. Third-Party Sharing and Sale of Data
We do not sell, rent, trade, or transfer any user data to third parties under any circumstances. There are no external databases, servers, or APIs connected to KnightVision.

---

## 6. Open Source Verification
KnightVision is free and open-source software. You can inspect the complete source code and verify our privacy practices at:
https://github.com/emirgms-creator/KnightVision

---

## 7. Changes to This Privacy Policy
If this Privacy Policy is updated, changes will be posted directly to this page with an updated revision date.

---

## 8. Contact Us
If you have any questions or feedback regarding this Privacy Policy, please open an issue on our GitHub repository:
https://github.com/emirgms-creator/KnightVision/issues
