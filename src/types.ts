export type Suit = 'SPADES' | 'HEARTS' | 'DIAMONDS' | 'CLUBS';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type Seat = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';

export interface Player {
  id: string; // Socket ID or "bot-X"
  name: string;
  seat: Seat | null;
  isBot?: boolean;
}

export interface GameState {
  roomCode: string;
  players: Player[];
  adminId: string;
  status: 'LOBBY' | 'BIDDING' | 'PLAYING' | 'ROUND_END' | 'GAME_OVER';
  dealer: Seat;
  turn: Seat;
  leadsWith: Suit | null;
  spadesBroken: boolean;
  hands: Record<Seat, Card[]>;
  bids: Record<Seat, number | null>;
  tricksWon: Record<Seat, number>;
  currentTrick: { seat: Seat; card: Card }[];
  lastTrick: { seat: Seat; card: Card }[] | null;
  /** Completed tricks of the current round, in order. Public information the bots use as card memory. */
  trickHistory: { seat: Seat; card: Card }[][];
  scores: {
    NS: { points: number; bags: number };
    EW: { points: number; bags: number };
  };
  roundNumber: number;
  /** One entry per finished round, oldest first. */
  roundHistory: RoundRecord[];
}

/** How one team's score changed in one round. */
export interface TeamRoundResult {
  /** Combined bid of the team's non-Nil players (0 if both bid Nil). */
  bid: number;
  /** Tricks won by the team's non-Nil players. */
  won: number;
  /** Whether the bid was made; null when both players bid Nil. */
  made: boolean | null;
  /** +10 per trick bid if made, -10 per trick bid if set. */
  bidPoints: number;
  /** Bags from overtricks on the bid. */
  overtricks: number;
  nils: { seat: Seat; made: boolean; tricks: number }[];
  /** +100 / -100 per Nil. */
  nilPoints: number;
  /** All bags gained this round: overtricks plus tricks taken by a failed Nil. */
  bagsGained: number;
  /** -100 for each time the team's bags reached 10 this round. */
  bagPenalty: number;
  /** Net points change for the round. */
  change: number;
  /** Score and bags after the round. */
  points: number;
  bags: number;
}

export interface RoundRecord {
  round: number;
  bids: Record<Seat, number>;
  tricksWon: Record<Seat, number>;
  teams: { NS: TeamRoundResult; EW: TeamRoundResult };
}

export interface RoomData {
  players: Player[];
  gameState: GameState | null;
}
