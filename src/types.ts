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
  status: 'LOBBY' | 'BIDDING' | 'PLAYING' | 'ROUND_END' | 'GAME_OVER';
  dealer: Seat;
  turn: Seat;
  leadsWith: Suit | null;
  spadesBroken: boolean;
  hands: Record<Seat, Card[]>;
  bids: Record<Seat, number | null>;
  tricksWon: Record<Seat, number>;
  currentTrick: { seat: Seat; card: Card }[];
  scores: {
    NS: { points: number; bags: number };
    EW: { points: number; bags: number };
  };
  roundHistory: any[];
}

export interface RoomData {
  players: Player[];
  gameState: GameState | null;
}
