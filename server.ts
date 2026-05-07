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
  const rooms = new Map<string, { players: Player[]; gameState: GameState | null, adminId: string }>();

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
    room.gameState.lastTrick = null;
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

  // --- BOT CONSTANTS & TUNABLES ---
  const NIL_BID_RISK_THRESHOLD = 45; // Lower = more aggressive. Risk score > threshold = Too risky for Nil.
  const RISK_VALUES = { 'A': 15, 'K': 12, 'Q': 8, 'J': 4, '10': 2 };

  const calculateBotBid = (hand: Card[]): number => {
    // Strategies for Nil bidding - assessing RISK
    let riskScore = 0;
    const suitCounts = { SPADES: 0, HEARTS: 0, DIAMONDS: 0, CLUBS: 0 };
    hand.forEach(c => suitCounts[c.suit]++);

    hand.forEach(c => {
      const val = getRankValue(c.rank);
      if (c.suit === 'SPADES') {
        // High spades are extremely dangerous
        if (val > 10) riskScore += (RISK_VALUES[c.rank as keyof typeof RISK_VALUES] || 0) * 2;
        else if (val > 5) riskScore += 5;
      } else {
        // High cards in other suits are risky unless we have a void to slough them
        if (val > 10) {
          riskScore += RISK_VALUES[c.rank as keyof typeof RISK_VALUES] || 0;
        }
      }
    });

    // Voids and Singletons provide escape routes for high cards
    Object.entries(suitCounts).forEach(([suit, count]) => {
      if (count === 0) riskScore -= 20; // Void is an excellent escape
      if (count === 1) riskScore -= 5;  // Singleton is helpful
    });

    if (riskScore < NIL_BID_RISK_THRESHOLD) {
      return 0; // Bid Nil
    }

    // Normal Bidding if Nil is too risky
    let bid = 0;
    const spades = hand.filter(c => c.suit === 'SPADES');
    const aces = hand.filter(c => c.rank === 'A');
    const kings = hand.filter(c => c.rank === 'K');

    bid += spades.length * 0.45;
    bid += aces.length * 0.8;
    bid += kings.length * 0.5;

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
    
    // Personal Progress
    const myBid = gameState.bids[seat] || 0;
    const myTricks = gameState.tricksWon[seat] || 0;
    const iNeedTricks = myTricks < myBid;

    // Bag & Bid context
    const teamBags = gameState.scores[teamName].bags;
    const isBagProne = teamBags >= 7 && teamBags <= 9;
    const totalBid = Object.values(gameState.bids).reduce((acc: number, b) => acc + (b || 0), 0);
    const isOverbid = totalBid > 13;

    // Nil Context
    const isMyNil = gameState.bids[seat] === 0;
    const isPartnerNil = gameState.bids[partnerSeat] === 0;
    const opponentTeamName = teamName === 'NS' ? 'EW' : 'NS';
    const opponentSeats = teams[opponentTeamName];
    const isOpponentNil = gameState.bids[opponentSeats[0]] === 0 || gameState.bids[opponentSeats[1]] === 0;

    // Calculate current winner in trick if cards are played
    const trickWinner = trick.length > 0 ? resolveTrick(trick, leadsWith!) : null;
    const partnerWinning = trickWinner === partnerSeat;

    if (!leadsWith) {
      // Leading the trick
      const nonSpades = hand.filter(c => c.suit !== 'SPADES');
      const spades = hand.filter(c => c.suit === 'SPADES').sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));
      
      // Strategy: Proactively lead power Spades if broken to cover Nil partner
      if (isPartnerNil && gameState.spadesBroken && spades.length > 0) {
        const powerSpades = spades.filter(c => c.rank === 'A' || c.rank === 'K');
        if (powerSpades.length > 0) return powerSpades[0];
      }

      // NIL HAND PLAY: Strategy when I am Nil
      if (isMyNil) {
        // Lead lowest card possible to create sloughing opportunities later
        // Preferably lead a short suit so we void it faster
        const suitCounts = { SPADES: 0, HEARTS: 0, DIAMONDS: 0, CLUBS: 0 };
        hand.forEach(c => suitCounts[c.suit]++);
        
        const possibleLeads = nonSpades.length > 0 ? nonSpades : spades;
        return possibleLeads.sort((a, b) => {
          // Priority 1: Shortest suit
          const countDiff = suitCounts[a.suit] - suitCounts[b.suit];
          if (countDiff !== 0) return countDiff;
          // Priority 2: Lowest rank
          return getRankValue(a.rank) - getRankValue(b.rank);
        })[0];
      }

      // NIL ATTACK: Strategy when an opponent is Nil
      if (isOpponentNil) {
        // Strategy: Lead low cards to "under-lead" the Nil bidder
        // This is especially good if we have high cards we want to get rid of while Nil wins
        const lowCards = nonSpades.filter(c => getRankValue(c.rank) <= 8).sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank));
        if (lowCards.length > 0) return lowCards[0];
        
        // Or lead Spades early to pull out their high Spades
        if (gameState.spadesBroken && spades.length > 0) {
          const midSpades = spades.filter(c => getRankValue(c.rank) >= 5 && getRankValue(c.rank) <= 10);
          if (midSpades.length > 0) return midSpades[0];
        }
      }
      
      if (nonSpades.length > 0) {
        const sortedDesc = nonSpades.sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));
        const sortedAsc = [...nonSpades].sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank));
        
        // Strategy 1: Protect Nil Partner
        if (isPartnerNil) {
          // Play high to clear the way or force cards out
          return sortedDesc[0];
        }

        // Strategy: Bag avoidance (Team bid met)
        if (isOverbid && !isPartnerNil) {
          const junk = hand.filter(c => c.suit !== 'SPADES').sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank));
          if (junk.length > 0) return junk[0];
          return hand.sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank))[0];
        }

        // Strategy 2: Attack Nil Opponent
        if (isOpponentNil) {
          // Play low to force them to win
          return sortedAsc[0];
        }

        if (needsTricks && getRankValue(sortedDesc[0].rank) >= 13) {
          // Lead High if we normally need tricks
          return sortedDesc[0];
        }
        // Lead low if we have bags or no power
        return sortedAsc[0];
      }
      
      // If only spades, lead the lowest spade 
      return hand.sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank))[0];
    } else {
      // Must follow suit if possible
      const following = hand.filter(c => c.suit === leadsWith);
      const partnerPlayed = trick.find(t => t.seat === partnerSeat);
      
      const bestInTrick = [...trick].sort((a, b) => {
        if (a.card.suit === b.card.suit) return getRankValue(b.card.rank) - getRankValue(a.card.rank);
        if (a.card.suit === 'SPADES') return -1;
        if (b.card.suit === 'SPADES') return 1;
        return 0;
      })[0];

      const partnerWinning = bestInTrick?.seat === partnerSeat;
      
      // NIL PROTECTION LOGIC
      let partnerIsAtRisk = false;
      if (isPartnerNil) {
        if (partnerPlayed) {
          partnerIsAtRisk = partnerWinning;
        } else {
          // Partner hasn't played yet. 
          // To be economical, we only "cover" if the current highest card is not already a strong card.
          // Strong cards (Ace, King, or high Spades) played by opponents already "cover" the Nil.
          const winningValue = getRankValue(bestInTrick.card.rank);
          const isWinningSpade = bestInTrick.card.suit === 'SPADES';
          if (!isWinningSpade) {
            // Non-spades: Risk if highest played so far is lower than Queen (12)
            if (winningValue < 12) partnerIsAtRisk = true;
          } else {
            // Spades: Risk if highest played is lower than 10
            if (winningValue < 10) partnerIsAtRisk = true;
          }
        }
      }

      if (following.length > 0) {
        const sortedDesc = following.sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));
        const sortedAsc = [...following].sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank));
        
        // NIL HAND PLAY: Strategy when I am Nil (Following Suit)
        if (isMyNil) {
          // If partner is already winning, dump the most dangerous card in suit
          if (partnerWinning) return sortedDesc[0];
          // Otherwise play as low as possible to stay under
          return sortedAsc[0];
        }

        // NIL ATTACK: Strategy when an opponent is Nil
        if (isOpponentNil) {
          // If an opponent is Nil and they haven't played yet OR they played a card we can get under
          const nilOpponentSeat = opponentSeats.find(s => gameState.bids[s] === 0);
          const hasNilOpponentPlayed = trick.some(t => t.seat === nilOpponentSeat);
          
          if (hasNilOpponentPlayed) {
            const nilCard = trick.find(t => t.seat === nilOpponentSeat)!.card;
            // Play a card just lower than the Nil bidder's card if possible to "squeeze" them
            const squeezeCards = following.filter(c => getRankValue(c.rank) < getRankValue(nilCard.rank))
              .sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));
            if (squeezeCards.length > 0) return squeezeCards[0];
          }
          // Default: try to stay low to not win if Nil might win
          return sortedAsc[0];
        }

        // Priority: Partner is Nil and at risk
        if (isPartnerNil && partnerIsAtRisk) {
          // Try to win the trick to protect partner
          const winningCards = following.filter(c => {
            if (bestInTrick.card.suit === leadsWith) return getRankValue(c.rank) > getRankValue(bestInTrick.card.rank);
            if (bestInTrick.card.suit === 'SPADES' && leadsWith !== 'SPADES') return false; 
            return true;
          }).sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));

          if (winningCards.length > 0) {
            if (partnerPlayed) {
              // Bot plays after partner: win with minimum necessary card to protect/take away
              return [...winningCards].sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank))[0];
            }
            // Bot plays before partner: play highest to ensure coverage
            return winningCards[0];
          }
        }

        // BAG AVOIDANCE: If team bid is met and no Nil to protect, play as low as possible
        if (isOverbid && !isPartnerNil) {
          return sortedAsc[0];
        }

        // Opponent is Nil - try to stay under them
        if (isOpponentNil) {
          return sortedAsc[0];
        }

        // If partner is already winning normally (and not Nil), play low
        if (partnerWinning && !isPartnerNil) return sortedAsc[0];

        // Normal play: find if any of our cards in suit can win
        const standardWinningCards = following.filter(c => {
          if (bestInTrick.card.suit === 'SPADES') return false; 
          return getRankValue(c.rank) > getRankValue(bestInTrick.card.rank);
        }).sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank));

        if (standardWinningCards.length > 0) {
          // If partner is Nil, we already handled necessary wins in Nil Protection block above.
          // Don't take tricks unnecessarily from opponents if Nil is safe.
          if (isPartnerNil) return sortedAsc[0];

          if (needsTricks && !partnerWinning) return standardWinningCards[0]; 
          
          if (isOverbid && !isPartnerNil) return sortedAsc[0];
          if (atRiskOfBags) return sortedAsc[0]; 
        }
        
        return sortedAsc[0];
      }

      // Out of suit
      const spades = hand.filter(c => c.suit === 'SPADES').sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));
      const nonSpades = hand.filter(c => c.suit !== 'SPADES').sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));

      // NIL HAND PLAY: Strategy when I am Nil (Void in Led Suit)
      if (isMyNil) {
        // Discard most dangerous cards first (High Non-Spades, then High Spades)
        if (nonSpades.length > 0) return nonSpades[0]; // Highest non-spade
        return spades[0]; // Highest spade
      }

      // Partner Nil and might be at risk? Trump it if possible
      if (isPartnerNil && partnerIsAtRisk) {
        if (spades.length > 0) {
          const winningSpades = spades.filter(c => {
            if (bestInTrick.card.suit !== 'SPADES') return true;
            return getRankValue(c.rank) > getRankValue(bestInTrick.card.rank);
          }).sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));

          if (winningSpades.length > 0) {
            if (partnerPlayed) {
              // Win with minimum spade when playing after partner
              return [...winningSpades].sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank))[0];
            }
            // Playing before partner: play highest spade to cover
            return winningSpades[0];
          }
        }
        // Can't win with spades? Dump highest junk to help clear suits
        if (nonSpades.length > 0) return nonSpades[0];
      }

      // BAG AVOIDANCE: If team bid met and not protecting Nil, slough low junk and avoid trumping
      if (isOverbid && !isPartnerNil) {
        if (nonSpades.length > 0) return nonSpades[nonSpades.length - 1]; // lowest non-spade
        return spades[spades.length - 1]; // lowest spade if forced
      }

      if (partnerWinning && !isPartnerNil) {
        // Partner is winning normally! Don't over-trump.
        return nonSpades.length > 0 ? nonSpades[nonSpades.length - 1] : hand.sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank))[0];
      }

      // If we need tricks, consider trumping
      if (needsTricks) {
        if (spades.length > 0) {
          const winningSpades = spades.filter(c => {
            if (bestInTrick.card.suit !== 'SPADES') return true;
            return getRankValue(c.rank) > getRankValue(bestInTrick.card.rank);
          }).sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank));

          if (winningSpades.length > 0) {
            // If protecting Nil, only win if we are hit-hungry or Nil is at risk (already handled above)
            if (isPartnerNil) return spades[spades.length - 1]; // lowest spade
            return winningSpades[0];
          }
        }
      }

      // Opponent Nil - Dump highest non-spade junk to keep low cards
      if (isOpponentNil) {
        if (nonSpades.length > 0) return nonSpades[0];
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
