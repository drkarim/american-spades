// Snapshot of the original bot (as of commit 32d5ec5), kept only as the
// baseline opponent for scripts/simulate.ts. Not used by the server.
import type { Card, GameState, Seat } from '../src/types.ts';
import { getRankValue, resolveTrick, getPartnerSeat, getTeamName } from '../src/rules.ts';

const NIL_BID_RISK_THRESHOLD = 30;
const RISK_VALUES = { 'A': 15, 'K': 12, 'Q': 8, 'J': 4, '10': 2 };

export const legacyBid = (hand: Card[]): number => {
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
export const legacyCard = (gameState: GameState, seat: Seat): Card => {
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
      // Preferably lead a long suit to keep low cards in other suits, or a short suit if it's safe
      const suitCounts = { SPADES: 0, HEARTS: 0, DIAMONDS: 0, CLUBS: 0 };
      hand.forEach(c => suitCounts[c.suit]++);
      
      // When Nil, leading low is the safest. 
      // We prefer leading suits where we have many cards but all are low.
      const possibleLeads = nonSpades.length > 0 ? nonSpades : spades;
      return [...possibleLeads].sort((a, b) => {
        // Priority 1: Lowest card rank (Absolute priority for Nil lead)
        const rankDiff = getRankValue(a.rank) - getRankValue(b.rank);
        if (rankDiff !== 0) return rankDiff;
        
        // Priority 2: Longer suits are often safer to lead low from
        return suitCounts[b.suit] - suitCounts[a.suit];
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
        // Identify cards that don't win the trick (staying under current best)
        const safeCards = sortedAsc.filter(c => {
          if (bestInTrick.card.suit === 'SPADES') {
            if (c.suit !== 'SPADES') return true;
            return getRankValue(c.rank) < getRankValue(bestInTrick.card.rank);
          } else {
            if (c.suit === 'SPADES') return false; 
            return getRankValue(c.rank) < getRankValue(bestInTrick.card.rank);
          }
        });

        if (safeCards.length > 0) {
          // User requested "lowest card possible". 
          // While sloughing high-but-safe cards is optimal, we'll favor lower ones for safety
          // as requested by the user to avoid any risk of winning if the trick state changes.
          return safeCards[0];
        }
        
        // Forced to win? Play the highest card to get it out of the hand
        // Since we are forced to take the trick, we might as well clear our most dangerous card.
        return sortedDesc[0];
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
      // Identify all cards that don't win the trick
      const safeCards = hand.filter(c => {
        if (bestInTrick.card.suit === 'SPADES') {
          if (c.suit !== 'SPADES') return true;
          return getRankValue(c.rank) < getRankValue(bestInTrick.card.rank);
        } else {
          // Winning card is not a spade, current card wins if it IS a spade
          return c.suit !== 'SPADES';
        }
      }).sort((a, b) => {
        // Priority 1: Highest rank (dumping dangerous cards)
        return getRankValue(b.rank) - getRankValue(a.rank);
      });

      if (safeCards.length > 0) return safeCards[0];
      // Forced to win (only have Spades higher than current trick)? Play highest to clear it.
      return hand.sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank))[0];
    }

    // Partner Nil and might be at risk? Trump it if possible
    // But only if I am NOT also Nil! (Don't sacrifice one Nil for another)
    if (isPartnerNil && partnerIsAtRisk && !isMyNil) {
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
