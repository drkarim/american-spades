import { Card, Rank, Suit } from './types';

export const getCardId = (card: Card) => `${card.rank}_of_${card.suit}`.toLowerCase();

export const getCardImage = (card: Card) => {
  const suitMap: Record<Suit, string> = {
    'SPADES': 'spades',
    'HEARTS': 'hearts',
    'DIAMONDS': 'diamonds',
    'CLUBS': 'clubs'
  };
  
  const rankMap: Record<Rank, string> = {
    'A': 'ace',
    'J': 'jack',
    'Q': 'queen',
    'K': 'king',
    '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', '10': '10'
  };

  // Using a reliable SVG source
  return `https://raw.githubusercontent.com/hayeah/playing-cards-assets/master/svg-cards/${rankMap[card.rank]}_of_${suitMap[card.suit]}.svg`;
};

export const getCardBack = () => `https://raw.githubusercontent.com/hayeah/playing-cards-assets/master/svg-cards/card_back.svg`;
