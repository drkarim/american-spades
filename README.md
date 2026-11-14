# 🃏 Karim’s Clubhouse Spades

A sophisticated, real-time multiplayer implementation of the classic American Spades card game. Designed for seamless play on mobile and desktop browsers with a focus on high-end interactions and professional aesthetics.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react)
![Socket.io](https://img.shields.io/badge/Socket.io-4.8-black?logo=socket.io)

---

## ✨ Key Features

- **Real-time Multiplayer**: Powered by Socket.io for low-latency gameplay between 4 players.
- **Sophisticated Design**: A "Dark Forest" themed UI with radial felt glows, high-contrast typography, and fluid animations.
- **Team-based Scoring**: Automated score tracking including partnership bids, tricks won, and "bags" (sandbagging) management.
- **Dynamic Card Sorting**: Intelligent hand organization (Spades → Hearts → Clubs → Diamonds) in descending order for quick strategic assessment.
- **Bot Support**: Fill empty seats with bots that count cards, bid from their hand and the table, and protect or attack Nil bids.
- **Bids in View**: When it is your turn to bid, the dialog shows what your partner and opponents have already bid.
- **Simulator Mode**: "Simulate 4 Players" on the home screen lets you control all four seats from one browser.
- **Immersive Animations**: 
  - Smooth card dealing and playing transitions using `motion`.
  - Trick-winning animations that clear cards toward the winner.
  - Active turn indicators and real-time state synchronization.
- **Mobile Optimized**: Responsive "App-like" layout that fits perfectly on smartphones and tablets.

---

## 🤖 Bot Intelligence

You can add a bot to any empty seat in the lobby. The same bot plays as your partner or as an opponent, and it only uses what a human in its seat could know: its own hand, the bids, the score, and the cards played so far.

### Bidding
- **Trick counting**: aces, guarded kings, high spades and spade length are each worth a fraction of a trick; short side suits count only when there are low spades to trump with.
- **Table awareness**: the last bidder adjusts to the table total, and bids go up slightly when the team is close to a bag penalty.
- **Nil**: bid on hands with no A, K or Q of spades, few spades, and low cards in every side suit. More likely when behind or when partner bid high; never when partner already bid Nil.

### Card Play
- **Card memory**: bots track every card played, who is out of which suit, and which cards have become the highest left.
- **Making the bid**: cash sure winners, draw trumps with long spades, empty short suits to trump later, win as cheaply as possible, and never overtake partner.
- **Setting opponents**: when they are a trick or two short near the end, take the extra tricks even at the cost of bags.
- **Bag avoidance**: once the bid is made, duck and throw high cards under someone else's winner.
- **Protecting a Nil partner**: lead cards partner can get under or suits partner is out of, and cover when partner is exposed.
- **Playing its own Nil**: stay under the winning card, shedding the biggest safe card.
- **Attacking an opponent's Nil**: lead low and play under the Nil bidder, unless that would cost the bot's own bid.

The full details, including the numbers behind each decision, are in [docs/bot-strategy.md](docs/bot-strategy.md).

---

## 🚀 Tech Stack

### Frontend
- **Framework**: React 19 (Vite)
- **Styling**: Tailwind CSS 4 (using CSS-first configuration)
- **Animation**: motion (`motion/react`)
- **Icons**: Lucide React
- **Real-time**: Socket.io Client

### Backend
- **Server**: Node.js with Express
- **Real-time**: Socket.io
- **Runtime**: tsx (TypeScript Execution)

---

## 🔧 Getting Started

### Prerequisites
- Node.js (v18+)
- npm

### Installation
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

### Development
Start the development server (runs both Express backend and Vite frontend via middleware):
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

### Production
Build the frontend assets and start the server in production mode:
```bash
npm run build
npm start
```
The server listens on `PORT` (default 3000).

### Deployment
The app is deployed on Railway from the `main` branch. The `Procfile` starts it with `npm start`, which serves the built frontend from `dist/`.

### Checks
Type-check the project:
```bash
npm run lint
```

Measure a bot change by playing full games between the current bot and the original one (arguments: number of games, random seed, bot A, bot B):
```bash
npm run sim -- 2000 1 new old
```
See [docs/bot-strategy.md](docs/bot-strategy.md) for how to read the output and try different settings.

---

## 🃏 Game Rules (Brief)

1. **Bidding**: Each player bids on how many tricks they expect to win. Partnerships (North/South and East/West) combine their bids.
2. **Gameplay**:
   - Spades are always trump.
   - You must "follow suit" if possible.
   - If you cannot follow suit, you may play a spade or any other card.
   - Spades cannot be "led" until the suit is broken (a spade is played on a previous lead).
3. **Scoring**:
   - Meeting the bid = 10 pts per trick bid.
   - Over-tricks (bags) = 1 pt each.
   - 10 bags = -100 pts penalty.
   - Failing to meet the bid = -10 pts per trick bid.
   - **Nil** (a bid of zero): +100 pts if that player takes no tricks, -100 pts if they take any. A Nil bidder's tricks do not count toward their partner's bid.
4. **Winning**: The game ends when a team reaches 500 points or falls to -200, and the team with more points wins (even if both passed 500 in the same round). If the scores are tied, another round is played.

---

## 🏗️ Project Structure

```text
├── src/
│   ├── bot/
│   │   └── bot.ts           # Bot bidding and card play
│   ├── components/
│   │   ├── GameBoard.tsx    # Table, hand, bid dialog and score summary
│   │   ├── Lobby.tsx        # Seats, bots and game start
│   │   └── Sandbox.tsx      # Four-player simulator mode
│   ├── rules.ts             # Trick resolution, legal plays and scoring
│   ├── types.ts             # Shared TS interfaces
│   ├── utils.ts             # Card image helpers
│   ├── App.tsx              # Home screen and view routing
│   └── main.tsx             # Entry point
├── scripts/
│   ├── simulate.ts          # Bot-vs-bot simulator (npm run sim)
│   └── legacyBot.ts         # Original bot, kept as the simulator baseline
├── docs/
│   └── bot-strategy.md      # How the bots bid and play
├── server.ts                # Express server, rooms and game flow
├── Procfile                 # Start command for deployment
└── package.json             # Scripts and dependencies
```

---

## 🤝 Contributing

This project was built using **Google AI Studio Build**. Contributions and forks are welcome!

---

## 📝 License

Distributed under the MIT License.
