import React, { useState, useEffect } from 'react';
import { GameState, Card, Seat } from '../types';
import { getCardImage } from '../utils';
import { motion, AnimatePresence } from 'motion/react';
import { Info, Trophy, AlertCircle, Eye, Play } from 'lucide-react';

interface GameBoardProps {
  gameState: GameState;
  mySeat: Seat | null;
  onPlayCard: (card: Card) => void;
  onSubmitBid: (bid: number) => void;
  onNextRound: () => void;
}

const SEAT_ORDER: Seat[] = ['NORTH', 'EAST', 'SOUTH', 'WEST'];

export default function GameBoard({ gameState, mySeat, onPlayCard, onSubmitBid, onNextRound }: GameBoardProps) {
  const [selectedBid, setSelectedBid] = useState<number | null>(null);
  const [showScoreSummary, setShowScoreSummary] = useState(false);

  useEffect(() => {
    if (gameState.status === 'ROUND_END') {
      setShowScoreSummary(true);
    } else {
      setShowScoreSummary(false);
    }
  }, [gameState.status]);

  const rotatedSeats = React.useMemo(() => {
    const startIndex = SEAT_ORDER.indexOf(mySeat || 'SOUTH');
    const result: Seat[] = [];
    for (let i = 0; i < 4; i++) {
      result.push(SEAT_ORDER[(startIndex + i) % 4]);
    }
    return result;
  }, [mySeat]);

  const isMyTurn = gameState.turn === mySeat;
  const isBidding = gameState.status === 'BIDDING';
  const isPlaying = gameState.status === 'PLAYING';

  const myHand = mySeat ? gameState.hands[mySeat] || [] : [];
  const sortedHand = [...myHand].sort((a, b) => {
    const suits = { 'SPADES': 0, 'HEARTS': 1, 'DIAMONDS': 2, 'CLUBS': 3 };
    const ranks = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
    if (suits[a.suit] !== suits[b.suit]) return suits[a.suit] - suits[b.suit];
    return ranks[b.rank] - ranks[a.rank];
  });

  const getTrickCardAtPosition = (seat: Seat) => {
    return gameState.currentTrick.find(t => t.seat === seat);
  };

  return (
    <div className="relative w-full h-[100dvh] bg-deep-black overflow-hidden flex flex-col font-sans">
      {/* Sophisticated Header */}
      <header className="h-16 px-6 flex items-center justify-between border-b border-white/10 bg-[#0a1a14] z-50">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-serif italic text-gold">Spades Royale</h1>
          <div className="flex items-center gap-2 bg-black/40 px-3 py-1 rounded border border-gold/30">
            <span className="text-[9px] uppercase tracking-widest text-white/50">Room Code</span>
            <span className="font-mono font-bold text-gold text-xs">{gameState.roomCode}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <AnimatePresence>
            {isMyTurn && gameState.status !== 'ROUND_END' && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="bg-red-900/20 border border-red-500/50 px-4 py-1 rounded-full animate-pulse flex items-center gap-2"
              >
                <div className="w-1.5 h-1.5 bg-red-400 rounded-full" />
                <span className="text-[10px] font-bold text-red-400 uppercase tracking-tighter">Your Turn</span>
              </motion.div>
            )}
          </AnimatePresence>
          <button onClick={() => setShowScoreSummary(true)} className="p-2 border border-white/20 rounded hover:bg-white/5 transition-colors">
            <Info className="w-4 h-4 text-white/60" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Table Area */}
        <div className="flex-1 relative bg-dark-green overflow-hidden">
          {/* Radial Felt Glow */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#143d2c_0%,_#072b1d_70%)] opacity-80" />
          
          {/* Table Pattern Grid */}
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

          {/* Player Labels & Trick Area */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative w-full max-w-[450px] aspect-square flex items-center justify-center">
              
              {/* Central Label */}
              <div className="text-center z-0 opacity-20 pointer-events-none">
                <div className="text-[10px] uppercase tracking-[0.4em] text-white">Current Trick</div>
                <div className="text-3xl font-serif italic text-white/50">Spades</div>
              </div>

              {/* Cards in Trick */}
              {rotatedSeats.map((seat, index) => {
                const trick = getTrickCardAtPosition(seat);
                const isActive = gameState.turn === seat;
                const player = gameState.players.find(p => p.seat === seat);

                const posClasses = [
                  "bottom-0 translate-y-12 flex-col-reverse", // My card
                  "right-0 translate-x-12",                   // Right
                  "top-0 -translate-y-12 flex-col",           // Top
                  "left-0 -translate-x-12",                   // Left
                ][index];

                const isVertical = index % 2 !== 0;

                return (
                  <div key={seat} className={`absolute ${posClasses} z-10 flex items-center gap-3`}>
                    {/* Player Info Pips */}
                    <div className="flex flex-col items-center">
                      <motion.div
                        animate={isActive ? { scale: [1, 1.1, 1], opacity: [0.6, 1, 0.6] } : {}}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className={`text-[9px] uppercase tracking-widest font-bold ${isActive ? 'text-gold' : 'text-white/30'}`}
                      >
                        {player?.name || '...'}
                      </motion.div>
                      <div className="text-[8px] font-mono text-white/40 uppercase mt-0.5">
                        {gameState.bids[seat] ?? '-'}/{gameState.tricksWon[seat]}
                      </div>
                    </div>

                    {/* Card Spot or Card */}
                    <AnimatePresence mode="wait">
                      {trick ? (
                        <motion.div
                          key="card"
                          initial={{ scale: 0.8, opacity: 0, y: index === 0 ? 20 : (index === 2 ? -20 : 0) }}
                          animate={{ scale: 1, opacity: 1, y: 0 }}
                          exit={{ scale: 0.8, opacity: 0 }}
                          className="shadow-2xl"
                        >
                          <img src={getCardImage(trick.card)} className="w-20 h-auto rounded border border-white/10" alt="card" />
                        </motion.div>
                      ) : (
                        <div className={`w-20 h-32 border border-dashed ${isActive ? 'border-gold/40 bg-gold/5' : 'border-white/5 bg-black/10'} rounded flex items-center justify-center`}>
                           {isActive && <div className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />}
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Desktop Sidebar (hidden on small mobile, but we keep for "Sophisticated" layout) -- simplified for hybrid mobile focus */}
        <aside className="hidden lg:flex w-64 bg-[#0a1a14] border-l border-white/10 p-6 flex-col gap-8 z-50">
           <section>
              <h2 className="text-[10px] uppercase tracking-[0.2em] text-gold mb-4">Scoreboard</h2>
              <div className="space-y-4">
                 <div className="bg-white/5 p-3 border-l-2 border-gold rounded-r-lg">
                    <div className="flex justify-between items-end mb-1">
                       <span className="text-xs font-semibold text-white/80">N / S</span>
                       <span className="text-xl font-serif italic text-gold">{gameState.scores.NS.points}</span>
                    </div>
                    <div className="text-[9px] text-white/40 uppercase">Bags: {gameState.scores.NS.bags} / 10</div>
                 </div>
                 <div className="bg-white/5 p-3 border-l-2 border-white/20 rounded-r-lg">
                    <div className="flex justify-between items-end mb-1">
                       <span className="text-xs font-semibold text-white/80">E / W</span>
                       <span className="text-xl font-serif italic">{gameState.scores.EW.points}</span>
                    </div>
                    <div className="text-[9px] text-white/40 uppercase">Bags: {gameState.scores.EW.bags} / 10</div>
                 </div>
              </div>
           </section>
           
           <div className="mt-auto p-4 bg-black/40 rounded border border-white/10">
              <p className="text-[9px] leading-relaxed text-white/40 uppercase tracking-wider">
                {gameState.spadesBroken ? 'Spades are broken. You can lead with Spades.' : 'Spades are not yet broken.'}
              </p>
           </div>
        </aside>
      </main>

      {/* Player Hand (Bottom) */}
      <footer className="relative h-48 bg-gradient-to-t from-black/90 to-transparent flex items-end justify-center pb-4 z-[40]">
        <div className="relative flex justify-center items-end px-12">
          {sortedHand.map((card, index) => {
            const rotation = (index - (sortedHand.length - 1) / 2) * 4;
            const xOffset = (index - (sortedHand.length - 1) / 2) * 15;
            const isValid = isMyTurn && isPlaying;

            return (
              <motion.button
                key={`${card.suit}-${card.rank}`}
                layoutId={`${card.suit}-${card.rank}`}
                initial={{ y: 150, opacity: 0 }}
                animate={{ 
                  y: 0, 
                  opacity: 1,
                  rotate: rotation,
                  x: xOffset,
                }}
                whileHover={{ 
                  y: -40, 
                  zIndex: 50, 
                  scale: 1.15,
                  boxShadow: "0 0 20px rgba(197, 160, 89, 0.4)"
                }}
                onClick={() => isValid && onPlayCard(card)}
                className={`absolute w-24 sm:w-28 h-auto shadow-2xl rounded-sm transition-opacity ${!isValid && isPlaying ? 'grayscale-[0.6] opacity-40' : ''}`}
                style={{ transformOrigin: 'bottom center' }}
              >
                <img src={getCardImage(card)} alt="Card" className="w-full h-auto rounded border border-white/10" />
                {isValid && (
                  <div className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100">
                    <Play className="w-4 h-4 text-gold fill-current" />
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Global Turn Banner (Mobile replacement for header turn) */}
        {!isBidding && isMyTurn && (
           <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-4 py-1 bg-black/60 border border-gold/30 rounded-full backdrop-blur-sm">
              <span className="text-[10px] font-bold text-gold uppercase tracking-[0.2em] animate-pulse">Your Turn to Lead</span>
           </div>
        )}
      </footer>

      {/* Bidding UI Popup */}
      <AnimatePresence>
        {isBidding && isMyTurn && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[1000] bg-black/60 backdrop-blur flex items-center justify-center p-6"
          >
            <div className="bg-[#0a1a14] border-2 border-gold/40 p-8 rounded-[2rem] shadow-2xl w-full max-w-sm">
              <h3 className="text-xl font-serif italic text-center mb-8 text-gold">Place Your Bid</h3>
              <div className="grid grid-cols-5 gap-3 mb-8">
                {Array.from({ length: 14 }).map((_, b) => (
                  <button
                    key={b}
                    onClick={() => setSelectedBid(b)}
                    className={`py-3 rounded-xl font-bold transition-all text-sm border ${selectedBid === b ? 'bg-gold text-black border-gold shadow-[0_0_15px_#c5a059]' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10'}`}
                  >
                    {b === 0 ? 'NIL' : b}
                  </button>
                ))}
              </div>
              <button
                disabled={selectedBid === null}
                onClick={() => selectedBid !== null && onSubmitBid(selectedBid)}
                className="w-full bg-gold disabled:opacity-30 text-black py-4 rounded-xl font-bold text-lg transition-all uppercase tracking-widest"
              >
                Confirm
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Score Summary Modal */}
      <AnimatePresence>
        {showScoreSummary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[2000] bg-black/90 backdrop-blur flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-[#0a1a14] w-full max-w-sm rounded-[2.5rem] border-4 border-gold/30 p-8 shadow-2xl"
            >
               <div className="text-center mb-8">
                  <Trophy className="w-12 h-12 text-gold mx-auto mb-4" />
                  <h2 className="text-3xl font-serif italic text-white tracking-tight">Game Stats</h2>
               </div>

               <div className="space-y-4 mb-8">
                  <div className="flex justify-between items-center p-4 bg-white/5 rounded-2xl border-l-4 border-gold">
                    <span className="font-bold text-gold text-lg">N / S</span>
                    <div className="text-right">
                       <div className="text-2xl font-serif italic">{gameState.scores.NS.points}</div>
                       <div className="text-[9px] uppercase text-white/30 tracking-widest mt-1">Bags: {gameState.scores.NS.bags}</div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-white/5 rounded-2xl border-l-4 border-white/20">
                    <span className="font-bold text-white/80 text-lg">E / W</span>
                    <div className="text-right">
                       <div className="text-2xl font-serif italic">{gameState.scores.EW.points}</div>
                       <div className="text-[9px] uppercase text-white/30 tracking-widest mt-1">Bags: {gameState.scores.EW.bags}</div>
                    </div>
                  </div>
               </div>

               {gameState.status === 'ROUND_END' ? (
                 <button
                   onClick={onNextRound}
                   className="w-full bg-gold text-black py-5 rounded-2xl font-bold text-xl hover:bg-gold/90 transition-all uppercase tracking-widest"
                 >
                   Continue
                 </button>
               ) : gameState.status === 'GAME_OVER' ? (
                 <div className="space-y-4">
                    <div className="text-center text-gold font-bold uppercase tracking-widest mb-4">Game Over</div>
                    <button
                      onClick={() => window.location.reload()}
                      className="w-full bg-white text-black py-5 rounded-2xl font-bold text-xl uppercase tracking-widest"
                    >
                      Rematch
                    </button>
                 </div>
               ) : (
                 <button
                   onClick={() => setShowScoreSummary(false)}
                   className="w-full bg-white/10 text-white py-5 rounded-2xl font-bold text-xl uppercase tracking-widest"
                 >
                   Return
                 </button>
               )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
