import type { Card, GameState, Rank, Seat, Suit } from './types.ts';

export type Play = { seat: Seat; card: Card };
export type TeamName = 'NS' | 'EW';

export const SUITS: Suit[] = ['SPADES', 'HEARTS', 'DIAMONDS', 'CLUBS'];
export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const SEATS: Seat[] = ['NORTH', 'EAST', 'SOUTH', 'WEST'];

export const TEAM_SEATS: Record<TeamName, [Seat, Seat]> = {
  NS: ['NORTH', 'SOUTH'],
  EW: ['EAST', 'WEST'],
};

const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

export const getRankValue = (rank: Rank): number => RANK_VALUES[rank];

export const getNextSeat = (current: Seat): Seat => SEATS[(SEATS.indexOf(current) + 1) % 4];

export const getPartnerSeat = (seat: Seat): Seat => SEATS[(SEATS.indexOf(seat) + 2) % 4];

export const getTeamName = (seat: Seat): TeamName => (seat === 'NORTH' || seat === 'SOUTH' ? 'NS' : 'EW');

export const createDeck = (): Card[] => {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ suit, rank });
  }
  return deck;
};

export const shuffle = (deck: Card[], random: () => number = Math.random): Card[] => {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

/** Does `card` beat `best`, the card currently winning the trick? */
export const beatsCard = (card: Card, best: Card): boolean => {
  if (card.suit === best.suit) return getRankValue(card.rank) > getRankValue(best.rank);
  return card.suit === 'SPADES';
};

export const winningPlay = (trick: Play[]): Play => {
  let winner = trick[0];
  for (let i = 1; i < trick.length; i++) {
    if (beatsCard(trick[i].card, winner.card)) winner = trick[i];
  }
  return winner;
};

export const resolveTrick = (trick: Play[], _ledSuit?: Suit): Seat => winningPlay(trick).seat;

/** Cards the holder of `hand` may legally play right now. */
export const legalCards = (hand: Card[], leadsWith: Suit | null, spadesBroken: boolean): Card[] => {
  if (leadsWith) {
    const following = hand.filter(c => c.suit === leadsWith);
    return following.length > 0 ? following : hand;
  }
  if (!spadesBroken) {
    const nonSpades = hand.filter(c => c.suit !== 'SPADES');
    if (nonSpades.length > 0) return nonSpades;
  }
  return hand;
};

/** Adds one round's result to `scores` (mutates it). */
export const applyRoundScores = (
  bids: GameState['bids'],
  tricksWon: GameState['tricksWon'],
  scores: GameState['scores'],
): void => {
  for (const name of ['NS', 'EW'] as const) {
    let roundPoints = 0;
    let roundBags = 0;
    let nonNilBid = 0;
    let nonNilWon = 0;

    for (const seat of TEAM_SEATS[name]) {
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
        nonNilBid += bid || 0;
        nonNilWon += won;
      }
    }

    if (nonNilBid > 0) {
      if (nonNilWon >= nonNilBid) {
        roundPoints += nonNilBid * 10;
        roundBags += nonNilWon - nonNilBid;
      } else {
        roundPoints -= nonNilBid * 10;
      }
    }

    scores[name].points += roundPoints;
    scores[name].bags += roundBags;

    while (scores[name].bags >= 10) {
      scores[name].points -= 100;
      scores[name].bags -= 10;
    }
  }
};

export const WIN_POINTS = 500;
export const LOSE_POINTS = -200;

/**
 * The game ends once a team reaches 500 or drops to -200. The team with more
 * points wins, even if both crossed 500 in the same round. On a tie nobody has
 * won yet and another round is played.
 */
export const getWinner = (scores: GameState['scores']): TeamName | null => {
  const { NS, EW } = scores;
  const reachedEnd = [NS.points, EW.points].some(p => p >= WIN_POINTS || p <= LOSE_POINTS);
  if (!reachedEnd || NS.points === EW.points) return null;
  return NS.points > EW.points ? 'NS' : 'EW';
};

export const isGameOver = (scores: GameState['scores']): boolean => getWinner(scores) !== null;
