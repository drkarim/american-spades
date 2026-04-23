import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Card, GameState, Player, Rank, Seat, Suit } from './src/types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
    },
  });

  const PORT = process.env.PORT || 3000;

  // Add Health Check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Game Rooms Storage
  const rooms = new Map<string, { players: Player[]; gameState: GameState | null }>();

  // Helper Functions
  const generateRoomCode = () => {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
  };

  const createDeck = (): Card[] => {
    const suits: Suit[] = ['SPADES', 'HEARTS', 'DIAMONDS', 'CLUBS'];
    const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck: Card[] = [];
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({ suit, rank });
      }
    }
    return deck;
  };

  const shuffle = (deck: Card[]) => {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  };

  const getNextSeat = (current: Seat): Seat => {
    const order: Seat[] = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
    const index = order.indexOf(current);
    return order[(index + 1) % 4];
  };

  const getRankValue = (rank: Rank): number => {
    const values: Record<Rank, number> = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
      'J': 11, 'Q': 12, 'K': 13, 'A': 14
    };
    return values[rank];
  };

  const resolveTrick = (trick: { seat: Seat; card: Card }[], ledSuit: Suit): Seat => {
    let winner = trick[0];
    for (let i = 1; i < trick.length; i++) {
      const current = trick[i];
      const winCard = winner.card;
      const curCard = current.card;

      if (curCard.suit === winCard.suit) {
        if (getRankValue(curCard.rank) > getRankValue(winCard.rank)) {
          winner = current;
        }
      } else if (curCard.suit === 'SPADES') {
        winner = current;
      }
    }
    return winner.seat;
  };

  const dealHands = (roomCode: string) => {
    const room = rooms.get(roomCode);
    if (!room || !room.gameState) return;

    const deck = shuffle(createDeck());
    const hands: Record<Seat, Card[]> = {
      NORTH: deck.slice(0, 13),
      EAST: deck.slice(13, 26),
      SOUTH: deck.slice(26, 39),
      WEST: deck.slice(39, 52),
    };

    room.gameState.hands = hands;
    room.gameState.status = 'BIDDING';
    room.gameState.turn = getNextSeat(room.gameState.dealer);
    room.gameState.bids = { NORTH: null, EAST: null, SOUTH: null, WEST: null };
    room.gameState.tricksWon = { NORTH: 0, EAST: 0, SOUTH: 0, WEST: 0 };
    room.gameState.currentTrick = [];
    room.gameState.leadsWith = null;
    room.gameState.spadesBroken = false;
  };

  const scoreRound = (roomCode: string) => {
    const room = rooms.get(roomCode);
    if (!room || !room.gameState) return;

    const { bids, tricksWon, scores } = room.gameState;

    const teams = [
      { name: 'NS' as const, seats: ['NORTH' as const, 'SOUTH' as const] },
      { name: 'EW' as const, seats: ['EAST' as const, 'WEST' as const] }
    ];

    for (const team of teams) {
      const teamBids = team.seats.map(s => bids[s] || 0);
      const teamTricks = team.seats.reduce((sum, s) => sum + tricksWon[s], 0);
      
      // Handle Nil bids separately
      let teamPoints = 0;
      let teamBags = 0;

      for (let i = 0; i < 2; i++) {
        const seat = team.seats[i];
        const bid = bids[seat];
        const won = tricksWon[seat];

        if (bid === 0) {
          if (won === 0) teamPoints += 100;
          else teamPoints -= 100;
        }
      }

      // Calculate combined bid team score
      const combinedBid = team.seats.reduce((sum, s) => bids[s] !== 0 ? sum + (bids[s] || 0) : sum, 0);
      const combinedWon = team.seats.reduce((sum, s) => bids[s] !== 0 ? sum + tricksWon[s] : sum, 0);

      if (combinedBid > 0) {
        if (combinedWon >= combinedBid) {
          teamPoints += combinedBid * 10;
          teamBags += (combinedWon - combinedBid);
        } else {
          teamPoints -= combinedBid * 10;
        }
      }

      scores[team.name].points += teamPoints;
      scores[team.name].bags += teamBags;

      // Deduct for bags
      while (scores[team.name].bags >= 10) {
        scores[team.name].points -= 100;
        scores[team.name].bags -= 10;
      }
    }

    if (scores.NS.points >= 500 || scores.EW.points >= 500 || scores.NS.points <= -200 || scores.EW.points <= -200) {
      room.gameState.status = 'GAME_OVER';
    } else {
      room.gameState.status = 'ROUND_END';
    }
  };

  // Socket logic
  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('createRoom', (name) => {
      const roomCode = generateRoomCode();
      const player: Player = { id: socket.id, name, seat: null };
      rooms.set(roomCode, { players: [player], gameState: null });
      socket.join(roomCode);
      socket.emit('roomJoined', { roomCode, players: [player], gameState: null });
    });

    socket.on('joinRoom', ({ name, roomCode }) => {
      const room = rooms.get(roomCode);
      if (!room) {
        socket.emit('error', 'Room not found');
        return;
      }
      if (room.players.length >= 4) {
        socket.emit('error', 'Room is full');
        return;
      }
      const player: Player = { id: socket.id, name, seat: null };
      room.players.push(player);
      socket.join(roomCode);
      io.to(roomCode).emit('roomJoined', { roomCode, players: room.players, gameState: room.gameState });
    });

    socket.on('claimSeat', ({ roomCode, seat }) => {
      const room = rooms.get(roomCode);
      if (!room) return;
      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;

      // Check if seat is taken
      if (room.players.some(p => p.seat === seat)) return;

      player.seat = seat;
      io.to(roomCode).emit('roomJoined', { roomCode, players: room.players, gameState: room.gameState });
    });

    socket.on('startGame', (roomCode) => {
      const room = rooms.get(roomCode);
      if (!room || room.players.length !== 4 || room.players.some(p => !p.seat)) return;

      const gameState: GameState = {
        roomCode,
        players: room.players,
        status: 'LOBBY',
        dealer: 'NORTH',
        turn: 'NORTH',
        leadsWith: null,
        spadesBroken: false,
        hands: { NORTH: [], EAST: [], SOUTH: [], WEST: [] },
        bids: { NORTH: null, EAST: null, SOUTH: null, WEST: null },
        tricksWon: { NORTH: 0, EAST: 0, SOUTH: 0, WEST: 0 },
        currentTrick: [],
        scores: { NS: { points: 0, bags: 0 }, EW: { points: 0, bags: 0 } },
        roundHistory: [],
      };
      room.gameState = gameState;
      dealHands(roomCode);
      io.to(roomCode).emit('gameStateUpdate', room.gameState);
    });

    socket.on('submitBid', ({ roomCode, bid }) => {
      const room = rooms.get(roomCode);
      if (!room || !room.gameState) return;
      const player = room.players.find(p => p.id === socket.id);
      if (!player || !player.seat || room.gameState.turn !== player.seat) return;

      room.gameState.bids[player.seat] = bid;
      const next = getNextSeat(player.seat);
      
      if (Object.values(room.gameState.bids).every(b => b !== null)) {
        room.gameState.status = 'PLAYING';
        room.gameState.turn = getNextSeat(room.gameState.dealer);
      } else {
        room.gameState.turn = next;
      }
      io.to(roomCode).emit('gameStateUpdate', room.gameState);
    });

    socket.on('playCard', ({ roomCode, card }) => {
      const room = rooms.get(roomCode);
      if (!room || !room.gameState) return;
      const player = room.players.find(p => p.id === socket.id);
      if (!player || !player.seat || room.gameState.turn !== player.seat) return;

      const seat = player.seat;
      const hand = room.gameState.hands[seat];
      const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
      if (cardIndex === -1) return;

      // Validation
      const leadsWith = room.gameState.leadsWith;
      const hasLedSuit = hand.some(c => c.suit === leadsWith);
      
      if (leadsWith && card.suit !== leadsWith && hasLedSuit) {
        socket.emit('error', `You must follow suit: ${leadsWith}`);
        return;
      }

      if (!leadsWith && card.suit === 'SPADES' && !room.gameState.spadesBroken) {
        const onlySpades = hand.every(c => c.suit === 'SPADES');
        if (!onlySpades) {
          socket.emit('error', 'Spades not yet broken');
          return;
        }
      }

      // Apply play
      room.gameState.hands[seat].splice(cardIndex, 1);
      room.gameState.currentTrick.push({ seat, card });
      
      if (!room.gameState.leadsWith) room.gameState.leadsWith = card.suit;
      if (card.suit === 'SPADES') room.gameState.spadesBroken = true;

      if (room.gameState.currentTrick.length === 4) {
        const winner = resolveTrick(room.gameState.currentTrick, room.gameState.leadsWith);
        room.gameState.tricksWon[winner]++;
        room.gameState.turn = winner;
        room.gameState.leadsWith = null;
        
        // Brief delay before clearing trick
        setTimeout(() => {
          if (!room.gameState) return;
          room.gameState.currentTrick = [];
          
          if (Object.values(room.gameState.hands).every(h => h.length === 0)) {
            scoreRound(roomCode);
            room.gameState.dealer = getNextSeat(room.gameState.dealer);
          }
          
          io.to(roomCode).emit('gameStateUpdate', room.gameState);
        }, 1500);
      } else {
        room.gameState.turn = getNextSeat(seat);
      }

      io.to(roomCode).emit('gameStateUpdate', room.gameState);
    });

    socket.on('nextRound', (roomCode) => {
      const room = rooms.get(roomCode);
      if (!room || !room.gameState) return;
      dealHands(roomCode);
      io.to(roomCode).emit('gameStateUpdate', room.gameState);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      // Optional: Handle cleanup or player timeout
    });
  });

  // Vite setup
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
