import React, { useState, useEffect } from 'react';
import { GameState, Card, Seat } from '../types';
import { getCardImage } from '../utils';
import { motion, AnimatePresence } from 'motion/react';
import { Info, Trophy, AlertCircle, Eye, Play, X, UserMinus } from 'lucide-react';

interface GameBoardProps {
  gameState: GameState;
  mySeat: Seat | null;
  adminId: string | null;
  myId: string | undefined;
  onPlayCard: (card: Card) => void;
  onSubmitBid: (bid: number) => void;
  onNextRound: () => void;
  onBootPlayer: (id: string) => void;
}

const SEAT_ORDER: Seat[] = ['NORTH', 'EAST', 'SOUTH', 'WEST'];

export default function GameBoard({ gameState, mySeat, adminId, myId, onPlayCard, onSubmitBid, onNextRound, onBootPlayer }: GameBoardProps) {
  const [selectedBid, setSelectedBid] = useState<number | null>(null);
  const [showScoreSummary, setShowScoreSummary] = useState(false);
  const [showLastTrick, setShowLastTrick] = useState(false);
  const [focusedCard, setFocusedCard] = useState<string | null>(null);

  const isAdmin = myId === adminId;

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

  useEffect(() => {
    if (gameState.status === 'ROUND_END' || !isMyTurn) {
      setFocusedCard(null);
    }
  }, [gameState.status, isMyTurn]);

  const handleCardClick = (card: Card) => {
    if (!isMyTurn || !isPlaying) return;
    
    const cardId = `${card.suit}-${card.rank}`;
    
    // On mobile (narrow screen), we use a two-tap system: first to select/preview, second to play
    if (window.innerWidth < 640) {
      if (focusedCard === cardId) {
        onPlayCard(card);
        setFocusedCard(null);
      } else {
        setFocusedCard(cardId);
      }
    } else {
      // On desktop, we still use hover for preview, so one click is fine
      onPlayCard(card);
    }
  };

  const myHand = mySeat ? gameState.hands[mySeat] || [] : [];
  const sortedHand = [...myHand].sort((a, b) => {
    const suits = { 'SPADES': 0, 'HEARTS': 1, 'CLUBS': 2, 'DIAMONDS': 3 };
    const ranks = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
    if (suits[a.suit] !== suits[b.suit]) return suits[a.suit] - suits[b.suit];
    return ranks[b.rank] - ranks[a.rank];
  });

  const getTrickCardAtPosition = (seat: Seat) => {
    return gameState.currentTrick.find(t => t.seat === seat);
  };

  const getTeamNames = (team: 'NS' | 'EW') => {
    const seats = team === 'NS' ? ['NORTH', 'SOUTH'] : ['EAST', 'WEST'];
    return gameState.players
      .filter(p => seats.includes(p.seat as any))
      .map(p => p.name)
      .join(' & ') || (team === 'NS' ? 'North & South' : 'East & West');
  };

  return (
    <div className="relative w-full h-[100dvh] bg-deep-black overflow-hidden flex flex-col font-sans">
      {/* Sophisticated Header */}
      <header className="h-16 px-6 flex items-center justify-between border-b border-white/10 bg-[#0a1a14] z-50">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-serif italic text-gold">Karim’s Clubhouse Spades</h1>
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
          <button 
            onClick={() => setShowLastTrick(true)} 
            disabled={!gameState.lastTrick}
            className="p-2 border border-white/20 rounded hover:bg-white/5 transition-colors disabled:opacity-20"
            title="Review Last Trick"
          >
            <Eye className="w-4 h-4 text-white/60" />
          </button>
          <button onClick={() => setShowScoreSummary(true)} className="p-2 border border-white/20 rounded hover:bg-white/5 transition-colors">
            <Info className="w-4 h-4 text-white/60" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Table Area */}
        <div className="flex-1 relative bg-dark-green">
          {/* Radial Felt Glow */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#143d2c_0%,_#072b1d_70%)] opacity-80" />
          
          {/* Table Pattern Grid */}
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

          {/* Player Labels & Trick Area */}
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <div className="relative w-full max-w-[500px] aspect-square flex items-center justify-center">
              
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
                  "bottom-0 translate-y-16 sm:translate-y-8", // Bottom (ME) - Adjusted for desktop
                  "right-0 translate-x-4",   // Right
                  "top-0 -translate-y-16 sm:-translate-y-8", // Top - Adjusted for desktop
                  "left-0 -translate-x-4",   // Left
                ][index];

                return (
                  <div key={seat} className={`absolute ${posClasses} z-10 flex items-center justify-center`}>
                    <div className="relative">
                      {/* Player Info Block */}
                      <div className={`absolute z-30 flex flex-col pointer-events-none whitespace-nowrap ${[
                        "bottom-full right-0 mb-4 items-end", // Bottom: Top-Right of card
                        "bottom-full right-0 mb-4 items-end", // Right (East): Top-Right of card
                        "top-full right-0 mt-4 items-end",    // Top: Bottom-Right of card
                        "bottom-full left-0 mb-4 items-start"  // Left (West): Top-Left of card
                      ][index]}`}>
                        
                        <motion.div
                          animate={isActive ? { scale: [1, 1.05, 1], opacity: [0.7, 1, 0.7] } : {}}
                          transition={{ repeat: Infinity, duration: 2 }}
                          className={`text-[10px] uppercase tracking-widest font-black flex items-center gap-1.5 mb-1 ${isActive ? 'text-gold' : 'text-white/40'}`}
                        >
                          {isAdmin && player && player.id !== myId && (
                            <button
                              onClick={() => onBootPlayer(player.id)}
                              className="pointer-events-auto bg-red-500 hover:bg-red-600 text-white p-0.5 rounded transition-colors mr-1"
                              title="Kick Player"
                            >
                              <X className="w-2 h-2" />
                            </button>
                          )}
                          {isActive && <motion.div animate={{ x: [-2, 2, -2] }} transition={{ repeat: Infinity, duration: 1 }}><Play className="w-2.5 h-2.5 rotate-90 fill-current" /></motion.div>}
                          {player?.name || '...'}
                        </motion.div>

                        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-black/80 backdrop-blur-xl rounded-lg border border-white/10 shadow-2xl">
                          <div className="flex flex-col items-center leading-none">
                              <span className="text-[7px] text-gold/40 uppercase font-black tracking-tighter mb-0.5">Bid</span>
                              <span className="text-lg font-serif italic text-gold leading-none">{gameState.bids[seat] ?? '-'}</span>
                          </div>
                          <div className="w-[1px] h-6 bg-white/10" />
                          <div className="flex flex-col items-center leading-none">
                              <span className="text-[7px] text-white/20 uppercase font-black tracking-tighter mb-0.5">Won</span>
                              <span className="text-lg font-serif italic text-white leading-none">{gameState.tricksWon[seat]}</span>
                          </div>
                        </div>
                      </div>

                      {/* Card Spot or Card */}
                      <AnimatePresence mode="popLayout">
                      {trick ? (
                        <motion.div
                          key={`${trick.card.suit}-${trick.card.rank}`}
                          initial={{ scale: 0.8, opacity: 0, y: index === 0 ? 20 : (index === 2 ? -20 : 0) }}
                          animate={{ scale: 1, opacity: 1, y: 0 }}
                          exit={() => {
                            // Find where the winner is
                            const winnerIndex = rotatedSeats.indexOf(gameState.turn);
                            const targets = [
                                { y: 200, x: 0 },   // Self
                                { y: 0, x: 200 },   // Right
                                { y: -200, x: 0 },  // Top
                                { y: 0, x: -200 }   // Left
                            ];
                            const target = targets[winnerIndex] || { x: 0, y: 0 };
                            return { 
                                x: target.x, 
                                y: target.y, 
                                scale: 0.2, 
                                opacity: 0,
                                transition: { duration: 0.6, ease: "circIn" }
                            };
                          }}
                          className="shadow-2xl z-20"
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
                    <div className="flex flex-col mb-1">
                       <span className="text-[10px] uppercase tracking-tighter text-gold/60 font-bold">Team 1</span>
                       <div className="flex justify-between items-end">
                         <span className="text-[11px] font-semibold text-white/90 truncate max-w-[120px]">{getTeamNames('NS')}</span>
                         <span className="text-xl font-serif italic text-gold">{gameState.scores.NS.points}</span>
                       </div>
                    </div>
                    <div className="text-[9px] text-white/40 uppercase">Bags: {gameState.scores.NS.bags} / 10</div>
                 </div>
                 <div className="bg-white/5 p-3 border-l-2 border-white/20 rounded-r-lg">
                    <div className="flex flex-col mb-1">
                       <span className="text-[10px] uppercase tracking-tighter text-white/30 font-bold">Team 2</span>
                       <div className="flex justify-between items-end">
                         <span className="text-[11px] font-semibold text-white/90 truncate max-w-[120px]">{getTeamNames('EW')}</span>
                         <span className="text-xl font-serif italic">{gameState.scores.EW.points}</span>
                       </div>
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
      <footer className="relative h-40 bg-gradient-to-t from-black/90 to-transparent flex items-end justify-center pb-4 z-[40]">
        <div className="relative flex justify-center items-end px-4">
          {sortedHand.map((card, index) => {
            const cardId = `${card.suit}-${card.rank}`;
            const isFocused = focusedCard === cardId;
            // Straight line layout for better visibility and mobile support
            const xOffset = (index - (sortedHand.length - 1) / 2) * 18; 
            const isValid = isMyTurn && isPlaying;

            return (
              <motion.button
                key={cardId}
                layoutId={cardId}
                initial={{ y: 150, opacity: 0 }}
                animate={{ 
                  y: isFocused ? -40 : 0, 
                  opacity: 1,
                  rotate: 0,
                  x: xOffset,
                  scale: isFocused ? 1.25 : 1,
                  zIndex: isFocused ? 100 : index,
                  boxShadow: isFocused ? "0 0 25px rgba(197, 160, 89, 0.6)" : "none"
                }}
                whileHover={{ 
                  y: -40, 
                  zIndex: 100, 
                  scale: 1.25,
                  boxShadow: "0 0 25px rgba(197, 160, 89, 0.6)"
                }}
                onClick={() => handleCardClick(card)}
                className={`absolute w-20 sm:w-28 h-auto shadow-2xl rounded-sm transition-opacity ${!isValid && isPlaying ? 'grayscale-[0.6] opacity-40' : ''}`}
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
            className="absolute inset-0 z-[1000] bg-black/10 flex items-center justify-center p-6"
          >
            <div className="bg-[#0a1a14] border-2 border-gold/40 p-8 rounded-[2rem] shadow-2xl w-full max-w-sm mb-20">
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
        {showLastTrick && gameState.lastTrick && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowLastTrick(false)}
            className="absolute inset-0 z-[1500] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-[#0a1a14] w-full max-w-[280px] rounded-[2rem] border-2 border-gold/30 p-6 shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-serif italic text-center mb-6 text-gold uppercase tracking-[0.2em]">Previous Trick</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                {gameState.lastTrick.map((t, i) => {
                   const p = gameState.players.find(pl => pl.seat === t.seat);
                   return (
                     <div key={i} className="flex flex-col items-center gap-1.5">
                       <span className="text-[8px] uppercase text-white/40 font-black tracking-widest truncate w-full text-center">{p?.name || t.seat}</span>
                       <img src={getCardImage(t.card)} className="w-[70px] h-auto rounded border border-white/10 shadow-xl" alt="card" />
                     </div>
                   );
                })}
              </div>
              <button 
                onClick={() => setShowLastTrick(false)}
                className="mt-8 w-full py-3 bg-white/5 border border-white/10 rounded-xl text-white/60 font-black uppercase tracking-widest text-[9px] hover:bg-white/10 transition-colors"
              >
                Return to Game
              </button>
            </motion.div>
          </motion.div>
        )}

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

                <div className="space-y-4 mb-4">
                  <div className="flex flex-col p-4 bg-white/5 rounded-2xl border-l-4 border-gold">
                    <span className="text-[10px] uppercase tracking-widest text-gold/60 mb-1">Team 1 (NS)</span>
                    {gameState.players.filter(p => ['NORTH', 'SOUTH'].includes(p.seat as string)).map(p => (
                      <div key={p.id} className="flex justify-between items-center text-xs py-1">
                        <span className="text-white/80">{p.name} {p.isBot && "(Bot)"}</span>
                        {isAdmin && p.id !== myId && (
                           <button onClick={() => onBootPlayer(p.id)} className="text-red-400 hover:text-red-500">
                             <UserMinus className="w-3 h-3" />
                           </button>
                        )}
                      </div>
                    ))}
                    <div className="flex justify-end items-center mt-2 pt-2 border-t border-white/5">
                        <div className="text-right">
                           <div className="text-2xl font-serif italic text-gold">{gameState.scores.NS.points}</div>
                           <div className="text-[9px] uppercase text-white/30 tracking-widest">Bags: {gameState.scores.NS.bags}</div>
                        </div>
                    </div>
                  </div>
                  <div className="flex flex-col p-4 bg-white/5 rounded-2xl border-l-4 border-white/20">
                    <span className="text-[10px] uppercase tracking-widest text-white/30 mb-1">Team 2 (EW)</span>
                    {gameState.players.filter(p => ['EAST', 'WEST'].includes(p.seat as string)).map(p => (
                      <div key={p.id} className="flex justify-between items-center text-xs py-1">
                        <span className="text-white/80">{p.name} {p.isBot && "(Bot)"}</span>
                        {isAdmin && p.id !== myId && (
                           <button onClick={() => onBootPlayer(p.id)} className="text-red-400 hover:text-red-500">
                             <UserMinus className="w-3 h-3" />
                           </button>
                        )}
                      </div>
                    ))}
                    <div className="flex justify-end items-center mt-2 pt-2 border-t border-white/5">
                        <div className="text-right">
                           <div className="text-2xl font-serif italic">{gameState.scores.EW.points}</div>
                           <div className="text-[9px] uppercase text-white/30 tracking-widest">Bags: {gameState.scores.EW.bags}</div>
                        </div>
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
