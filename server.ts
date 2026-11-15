import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Card, GameState, Player, Seat } from './src/types.ts';
import { applyRoundScores, createDeck, getNextSeat, isGameOver, resolveTrick, shuffle } from './src/rules.ts';
import { calculateBotBid, chooseBotCard } from './src/bot/bot.ts';

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
  const rooms = new Map<string, { players: Player[]; gameState: GameState | null, adminId: string }>();

  // Helper Functions
  const generateRoomCode = () => {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
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
    room.gameState.lastTrick = null;
    room.gameState.trickHistory = [];
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

    const gs = room.gameState;
    const teams = applyRoundScores(gs.bids, gs.tricksWon, gs.scores);
    gs.roundHistory = gs.roundHistory || [];
    gs.roundHistory.push({
      round: gs.roundNumber,
      bids: { NORTH: gs.bids.NORTH ?? 0, EAST: gs.bids.EAST ?? 0, SOUTH: gs.bids.SOUTH ?? 0, WEST: gs.bids.WEST ?? 0 },
      tricksWon: { ...gs.tricksWon },
      teams,
    });

    if (isGameOver(room.gameState.scores)) {
      room.gameState.status = 'GAME_OVER';
    } else {
      room.gameState.status = 'ROUND_END';
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
        const bid = calculateBotBid(gameState, currentTurn);
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
          gameState.trickHistory.push([...gameState.currentTrick]);
          gameState.turn = winner;
          gameState.leadsWith = null;
          
          io.to(roomCode).emit('gameStateUpdate', gameState);

          setTimeout(() => {
            if (!room.gameState || room.gameState.roundNumber !== scheduledRound) return;
            room.gameState.lastTrick = [...room.gameState.currentTrick];
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
      rooms.set(roomCode, { players: [player], gameState: null, adminId: socket.id });
      socket.join(roomCode);
      socket.emit('roomJoined', { roomCode, players: [player], gameState: null, adminId: socket.id });
    });

    socket.on('joinRoom', ({ name, roomCode }) => {
      const sanitizedCode = roomCode?.trim().toUpperCase();
      const room = rooms.get(sanitizedCode);
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
      socket.join(sanitizedCode);
      io.to(sanitizedCode).emit('roomJoined', { roomCode: sanitizedCode, players: room.players, gameState: room.gameState, adminId: room.adminId });
    });

    socket.on('claimSeat', ({ roomCode, seat }) => {
      const room = rooms.get(roomCode);
      if (!room) return;
      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;

      // Check if seat is taken
      if (room.players.some(p => p.seat === seat)) return;

      player.seat = seat;
      io.to(roomCode).emit('roomJoined', { roomCode, players: room.players, gameState: room.gameState, adminId: room.adminId });
      
      // If game is in progress, trigger bot action check
      if (room.gameState) {
        triggerBotAction(roomCode);
      }
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
      io.to(roomCode).emit('roomJoined', { roomCode, players: room.players, gameState: room.gameState, adminId: room.adminId });
      
      // If game is in progress, the bot might need to act immediately
      if (room.gameState) {
        triggerBotAction(roomCode);
      }
    });

    socket.on('bootPlayer', ({ roomCode, playerId }) => {
      const room = rooms.get(roomCode);
      if (!room || room.adminId !== socket.id) return;

      const playerToBoot = room.players.find(p => p.id === playerId);
      if (!playerToBoot) return;

      // Cannot boot self
      if (playerToBoot.id === socket.id) return;

      // Remove player from list
      room.players = room.players.filter(p => p.id !== playerId);

      // If they were human, they might need to be kicked from the socket room
      const bootedSocket = io.sockets.sockets.get(playerId);
      if (bootedSocket) {
        bootedSocket.leave(roomCode);
        bootedSocket.emit('kicked');
      }

      // If game is in progress, we might need more complex logic, but for now:
      // If we boot someone, we should probably reset or update the gameState players list
      if (room.gameState) {
        room.gameState.players = room.players;
      }

      io.to(roomCode).emit('roomJoined', { roomCode, players: room.players, gameState: room.gameState, adminId: room.adminId });
    });

    socket.on('startGame', (roomCode) => {
      const room = rooms.get(roomCode);
      if (!room || room.players.length !== 4 || room.players.some(p => !p.seat)) return;

      const gameState: GameState = {
        roomCode,
        players: room.players,
        adminId: room.adminId,
        status: 'LOBBY',
        dealer: 'NORTH',
        turn: 'NORTH',
        leadsWith: null,
        spadesBroken: false,
        hands: { NORTH: [], EAST: [], SOUTH: [], WEST: [] },
        bids: { NORTH: null, EAST: null, SOUTH: null, WEST: null },
        tricksWon: { NORTH: 0, EAST: 0, SOUTH: 0, WEST: 0 },
        currentTrick: [],
        lastTrick: null,
        trickHistory: [],
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
        room.gameState.trickHistory.push([...room.gameState.currentTrick]);
        room.gameState.turn = winner;
        room.gameState.leadsWith = null;
        
        const currentRoundAtPlay = room.gameState.roundNumber;

        // Brief delay before clearing trick
        setTimeout(() => {
          if (!room.gameState || room.gameState.roundNumber !== currentRoundAtPlay) return;
          room.gameState.lastTrick = [...room.gameState.currentTrick];
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
      triggerBotAction(roomCode);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      
      for (const [roomCode, room] of rooms.entries()) {
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          const removedPlayer = room.players[playerIndex];
          room.players.splice(playerIndex, 1);
          
          // Reassign seat if the player had one
          if (room.gameState && removedPlayer.seat) {
             // In a real game we might want to pause or add a bot, 
             // but here we just make the seat available for now?
             // Actually, the game logic depends on 4 players being active.
             // If someone leaves mid-game, it might be better to just reset to lobby or mark as needing replacement.
             // For now, let's just update the players list.
             room.gameState.players = room.players;
          }

          if (room.players.length === 0 || room.players.every(p => p.isBot)) {
            // Give 30 seconds for a human to rejoin (e.g. on refresh) before deleting
            setTimeout(() => {
              const currentRoom = rooms.get(roomCode);
              if (currentRoom && (currentRoom.players.length === 0 || currentRoom.players.every(p => p.isBot))) {
                console.log(`[Room ${roomCode}] Empty for 30s, deleting.`);
                rooms.delete(roomCode);
              }
            }, 30000);
          } else {
            if (room.adminId === socket.id) {
              const nextHuman = room.players.find(p => !p.isBot);
              if (nextHuman) {
                room.adminId = nextHuman.id;
                if (room.gameState) room.gameState.adminId = nextHuman.id;
              } else {
                rooms.delete(roomCode);
                return;
              }
            }
            io.to(roomCode).emit('roomJoined', { roomCode, players: room.players, gameState: room.gameState, adminId: room.adminId });
          }
          break;
        }
      }
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
