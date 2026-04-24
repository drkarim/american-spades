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
- **Bot Support**: Fill empty seats with intelligent AI players that understand complex bidding and gameplay strategies.
- **Immersive Animations**: 
  - Smooth card dealing and playing transitions using `framer-motion`.
  - Trick-winning animations that clear cards toward the winner.
  - Active turn indicators and real-time state synchronization.
- **Mobile Optimized**: Responsive "App-like" layout that fits perfectly on smartphones and tablets.

---

## 🤖 Bot Intelligence

The game features built-in AI bots that simulate human-like decision-making. You can add bots to any empty seat in the lobby.

### Bidding Strategy
Bots evaluate their hand strength using a weighted scoring system:
- **Spade Power**: Length of spade suit contributes to a base bid.
- **High Cards**: Aces and Kings add significant win probability.
- **Suit Distribution**: Bots recognize the value of "voids" and "singletons" which allow early trumping.
- **Minimums**: Bots always bid at least 1 trick (unless they detect a rare Nil opportunity).

### Gameplay Logic
The AI adapts its strategy based on the current game state:
- **Nil Awareness**: Bots play defensively to protect a Nil partner (leading high to clear paths) or aggressively to "set" a Nil opponent (leading low to force them to win).
- **Bag Management**: If a team has met its bid and is at risk of "sandbagging," the bot will prioritize discarding high cards and losing tricks.
- **Trump Control**: Bots hold back high spades (the boss cards) until necessary to win critical tricks or follow suit.
- **Follow Suit Discipline**: Strict adherence to following suit while balancing the need to win the trick versus saving power for later.

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

---

## 🏗️ Project Structure

```text
├── src/
│   ├── components/
│   │   ├── GameBoard.tsx    # Main game UI and client logic
│   │   ├── Lobby.tsx        # Room creation and joining
│   │   └── TrickOutcome.tsx # Scoreboard and post-trick summary
│   ├── types.ts             # Shared TS interfaces
│   ├── App.tsx              # Component routing
│   └── main.tsx             # Entry point
├── server.ts                # Express backend & Game Engine
└── package.json             # Build and dependency manifest
```

---

## 🤝 Contributing

This project was built using **Google AI Studio Build**. Contributions and forks are welcome!

---

## 📝 License

Distributed under the MIT License.
