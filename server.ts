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

  const PORT = Number(process.env.PORT) || 3000;

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
    room.gameState.roundNumber = (room.gameState.roundNumber || 0) + 1;
    room.gameState.status = 'BIDDING';
    room.gameState.turn = getNextSeat(room.gameState.dealer);
    room.gameState.bids = { NORTH: null, EAST: null, SOUTH: null, WEST: null };
    room.gameState.tricksWon = { NORTH: 0, EAST: 0, SOUTH: 0, WEST: 0 };
    room.gameState.currentTrick = [];
    room.gameState.leadsWith = null;
    room.gameState.spadesBroken = false;

    // Verify hand sizes
    const counts = Object.entries(hands).map(([s, h]) => `${s}: ${h.length}`);
    console.log(`[Room ${roomCode}] New Round ${room.gameState.roundNumber} dealt. Hand sizes: ${counts.join(', ')}`);
    
    if (Object.values(hands).some(h => h.length !== 13)) {
      console.error(`[Room ${roomCode}] CRITICAL: Invalid hand size detected during deal!`);
    }
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
      let roundPoints = 0;
      let roundBags = 0;
      let nonNilBid = 0;
      let nonNilWon = 0;

      for (const seat of team.seats) {
        const bid = bids[seat];
        const won = tricksWon[seat];

        if (bid === 0) {
          if (won === 0) {
            roundPoints += 100;
          } else {
            roundPoints -= 100;
            roundBags += won;
          }
        } else {
          nonNilBid += (bid || 0);
          nonNilWon += won;
        }
      }

      if (nonNilBid > 0) {
        if (nonNilWon >= nonNilBid) {
          roundPoints += nonNilBid * 10;
          roundBags += (nonNilWon - nonNilBid);
        } else {
          roundPoints -= nonNilBid * 10;
        }
      }

      scores[team.name].points += roundPoints;
      scores[team.name].bags += roundBags;

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

  const calculateBotBid = (hand: Card[]): number => {
    let bid = 0;
    const spades = hand.filter(c => c.suit === 'SPADES');
    const aces = hand.filter(c => c.rank === 'A');
    const kings = hand.filter(c => c.rank === 'K');

    bid += spades.length * 0.45;
    bid += aces.length * 0.8;
    bid += kings.length * 0.5;

    // Adjust for long suits/short suits
    const suitCounts = { SPADES: 0, HEARTS: 0, DIAMONDS: 0, CLUBS: 0 };
    hand.forEach(c => suitCounts[c.suit]++);
    Object.values(suitCounts).forEach(count => {
      if (count === 0) bid += 1; // Void
      if (count === 1) bid += 0.5; // Singleton
    });

    return Math.max(1, Math.round(bid));
  };

  const getPartnerSeat = (seat: Seat): Seat => {
    if (seat === 'NORTH') return 'SOUTH';
    if (seat === 'SOUTH') return 'NORTH';
    if (seat === 'EAST') return 'WEST';
    return 'EAST'; // WEST
  };

  const getTeamName = (seat: Seat): 'NS' | 'EW' => {
    if (seat === 'NORTH' || seat === 'SOUTH') return 'NS';
    return 'EW';
  };

  const chooseBotCard = (gameState: GameState, seat: Seat): Card => {
    const hand = gameState.hands[seat];
    const leadsWith = gameState.leadsWith;
    const trick = gameState.currentTrick;
    const partnerSeat = getPartnerSeat(seat);
    const teamName = getTeamName(seat);
    
    // Team Progress
    const teams = {
      NS: ['NORTH' as Seat, 'SOUTH' as Seat],
      EW: ['EAST' as Seat, 'WEST' as Seat]
    };
    const teamSeats = teams[teamName];
    const teamBid = (gameState.bids[teamSeats[0]] || 0) + (gameState.bids[teamSeats[1]] || 0);
    const teamTricks = (gameState.tricksWon[teamSeats[0]] || 0) + (gameState.tricksWon[teamSeats[1]] || 0);
    const needsTricks = teamTricks < teamBid;
    const atRiskOfBags = teamTricks >= teamBid;

    // Calculate current winner in trick
    const trickWinner = trick.length > 0 ? resolveTrick(trick, leadsWith!) : null;
    const partnerWinning = trickWinner === partnerSeat;

    if (!leadsWith) {
      // Leading the trick
      const nonSpades = hand.filter(c => c.suit !== 'SPADES');
      
      if (nonSpades.length > 0) {
        const sortedNonSpades = nonSpades.sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));
        
        if (needsTricks && getRankValue(sortedNonSpades[0].rank) >= 13) {
          // Lead High if we need tricks
          return sortedNonSpades[0];
        }
        // Lead low if we have bags or no power
        return sortedNonSpades[sortedNonSpades.length - 1];
      }
      
      // If only spades, lead the lowest spade to minimize unnecessary wins unless it's late game
      return hand.sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank))[0];
    } else {
      // Must follow suit if possible
      const following = hand.filter(c => c.suit === leadsWith);
      
      const bestInTrick = [...trick].sort((a, b) => {
        if (a.card.suit === b.card.suit) return getRankValue(b.card.rank) - getRankValue(a.card.rank);
        if (a.card.suit === 'SPADES') return -1;
        if (b.card.suit === 'SPADES') return 1;
        return 0;
      })[0];

      if (following.length > 0) {
        const sortedDesc = following.sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));
        const sortedAsc = [...following].sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank));
        
        // If partner is winning, play low (unless we are testing their power, but usually just play low)
        if (partnerWinning) return sortedAsc[0];

        // Find if any of our cards in suit can win
        const winningCards = following.filter(c => {
          if (bestInTrick.card.suit === 'SPADES') return false; 
          return getRankValue(c.rank) > getRankValue(bestInTrick.card.rank);
        }).sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank));

        if (winningCards.length > 0) {
          if (needsTricks) return winningCards[0]; // Lowest winner
          if (atRiskOfBags) return sortedAsc[0]; // Play low common card to avoid winning
        }
        
        return sortedAsc[0];
      }

      // Out of suit
      if (partnerWinning) {
        // Partner is winning! Don't over-trump.
        // Dump the highest non-spade junk to get rid of it
        const nonSpades = hand.filter(c => c.suit !== 'SPADES').sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));
        return nonSpades.length > 0 ? nonSpades[0] : hand.sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank))[0];
      }

      // If we need tricks, consider trumping
      if (needsTricks) {
        const spades = hand.filter(c => c.suit === 'SPADES');
        if (spades.length > 0) {
          const winningSpades = spades.filter(c => {
            if (bestInTrick.card.suit !== 'SPADES') return true;
            return getRankValue(c.rank) > getRankValue(bestInTrick.card.rank);
          }).sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank));

          if (winningSpades.length > 0) return winningSpades[0];
        }
      }

      // Throw junk (lowest rank)
      return hand.sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank))[0];
    }
  };

  const triggerBotAction = (roomCode: string) => {
    const room = rooms.get(roomCode);
    if (!room || !room.gameState) return;
    
    const scheduledRound = room.gameState.roundNumber;

    // Safety delay to make it feel more natural
    setTimeout(() => {
      const { gameState, players } = room;
      if (!gameState || gameState.roundNumber !== scheduledRound) return;
      
      const currentTurn = gameState.turn;
      const botPlayer = players.find(p => p.seat === currentTurn && p.isBot);
      
      if (!botPlayer) return;

      if (gameState.status === 'BIDDING') {
        const bid = calculateBotBid(gameState.hands[currentTurn]);
        gameState.bids[currentTurn] = bid;
        const next = getNextSeat(currentTurn);
        
        if (Object.values(gameState.bids).every(b => b !== null)) {
          gameState.status = 'PLAYING';
          gameState.turn = getNextSeat(gameState.dealer);
        } else {
          gameState.turn = next;
        }
        io.to(roomCode).emit('gameStateUpdate', gameState);
        triggerBotAction(roomCode);
      } else if (gameState.status === 'PLAYING') {
        // Prevent playing if trick is full
        if (gameState.currentTrick.length >= 4) return;

        const card = chooseBotCard(gameState, currentTurn);
        const hand = gameState.hands[currentTurn];
        const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
        
        if (cardIndex === -1) return;

        gameState.hands[currentTurn].splice(cardIndex, 1);
        gameState.currentTrick.push({ seat: currentTurn, card });
        
        if (!gameState.leadsWith) gameState.leadsWith = card.suit;
        if (card.suit === 'SPADES') gameState.spadesBroken = true;

        if (gameState.currentTrick.length === 4) {
          const winner = resolveTrick(gameState.currentTrick, gameState.leadsWith);
          gameState.tricksWon[winner]++;
          gameState.turn = winner;
          gameState.leadsWith = null;
          
          io.to(roomCode).emit('gameStateUpdate', gameState);

          setTimeout(() => {
            if (!room.gameState || room.gameState.roundNumber !== scheduledRound) return;
            room.gameState.currentTrick = [];
            
            if (Object.values(room.gameState.hands).every(h => h.length === 0)) {
              scoreRound(roomCode);
              room.gameState.dealer = getNextSeat(room.gameState.dealer);
            }
            
            io.to(roomCode).emit('gameStateUpdate', room.gameState);
            triggerBotAction(roomCode);
          }, 1500);
        } else {
          gameState.turn = getNextSeat(currentTurn);
          io.to(roomCode).emit('gameStateUpdate', gameState);
          triggerBotAction(roomCode);
        }
      }
    }, 1000);
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

    socket.on('addBot', ({ roomCode, seat }) => {
      const room = rooms.get(roomCode);
      if (!room) return;
      if (room.players.length >= 4) return;
      if (room.players.some(p => p.seat === seat)) return;

      const botId = `bot-${Math.random().toString(36).substring(7)}`;
      const botPlayer: Player = {
        id: botId,
        name: `Bot ${seat.charAt(0) + seat.slice(1).toLowerCase()}`,
        seat,
        isBot: true
      };
      room.players.push(botPlayer);
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
        roundNumber: 0,
        roundHistory: [],
      };
      room.gameState = gameState;
      dealHands(roomCode);
      io.to(roomCode).emit('gameStateUpdate', room.gameState);
      
      // Check if first turn is a bot
      triggerBotAction(roomCode);
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
      triggerBotAction(roomCode);
    });

    socket.on('playCard', ({ roomCode, card }) => {
      const room = rooms.get(roomCode);
      if (!room || !room.gameState) return;
      
      // Guard: Don't allow playing if a trick is currently being resolved (delay period)
      if (room.gameState.currentTrick.length >= 4) return;

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
        
        const currentRoundAtPlay = room.gameState.roundNumber;

        // Brief delay before clearing trick
        setTimeout(() => {
          if (!room.gameState || room.gameState.roundNumber !== currentRoundAtPlay) return;
          room.gameState.currentTrick = [];
          
          if (Object.values(room.gameState.hands).every(h => h.length === 0)) {
            scoreRound(roomCode);
            room.gameState.dealer = getNextSeat(room.gameState.dealer);
          }
          
          io.to(roomCode).emit('gameStateUpdate', room.gameState);
          triggerBotAction(roomCode);
        }, 1500);
      } else {
        room.gameState.turn = getNextSeat(seat);
        triggerBotAction(roomCode);
      }

      io.to(roomCode).emit('gameStateUpdate', room.gameState);

      // Sanity check: Log hand counts to verify balance
      const handCounts = Object.entries(room.gameState.hands).map(([s, h]) => `${s}: ${h.length}`).join(', ');
      console.log(`[Room ${roomCode}] Card played by ${seat}. Hand counts: ${handCounts}. Trick size: ${room.gameState.currentTrick.length}`);
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
