import { Player, Seat } from '../types';
import { motion } from 'motion/react';
import { User, Shield, Share2 } from 'lucide-react';

interface LobbyProps {
  players: Player[];
  roomCode: string;
  onClaimSeat: (seat: Seat) => void;
  onStartGame: () => void;
  myId: string | undefined;
}

const SEATS: Seat[] = ['NORTH', 'SOUTH', 'EAST', 'WEST'];

export default function Lobby({ players, roomCode, onClaimSeat, onStartGame, myId }: LobbyProps) {
  const getPlayerAtSeat = (seat: Seat) => players.find(p => p.seat === seat);
  
  const allSeatsFilled = players.length === 4 && SEATS.every(s => players.some(p => p.seat === s));
  const isCreator = players[0]?.id === myId;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full h-full max-w-4xl flex flex-col items-center gap-12 pt-8"
    >
      <div className="text-center space-y-4">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-gold opacity-60">Lobby</h2>
        <div className="flex items-center gap-4 bg-black/40 px-6 py-3 rounded-xl border border-gold/30">
          <span className="text-[10px] uppercase tracking-widest text-white/50">Room Code</span>
          <span className="text-3xl font-mono font-bold tracking-widest text-gold">{roomCode}</span>
          <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <Share2 className="w-5 h-5 text-gold" />
          </button>
        </div>
      </div>

      <div className="relative w-full aspect-square max-w-[320px] sm:max-w-[400px]">
        {/* The Card Table */}
        <div className="absolute inset-0 bg-dark-green rounded-full border-[12px] border-[#0a1a14] shadow-[inset_0_0_50px_rgba(0,0,0,0.5)] flex items-center justify-center">
           <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
          <div className="text-white/5 text-4xl font-serif italic rotate-12 select-none uppercase tracking-tighter">Spades Royale</div>
        </div>

        {/* Seats */}
        {SEATS.map((seat) => {
          const player = getPlayerAtSeat(seat);
          const posClasses = {
            NORTH: "-top-12 left-1/2 -translate-x-1/2",
            SOUTH: "-bottom-12 left-1/2 -translate-x-1/2",
            EAST: "-right-12 top-1/2 -translate-y-1/2",
            WEST: "-left-12 top-1/2 -translate-y-1/2",
          }[seat];

          return (
            <motion.div
              key={seat}
              className={`absolute ${posClasses} z-10 flex flex-col items-center gap-2`}
              whileHover={!player ? { scale: 1.05 } : {}}
            >
              <div className="text-[10px] font-bold tracking-[0.2em] text-gold opacity-50 mb-1">{seat}</div>
              <button
                onClick={() => !player && onClaimSeat(seat)}
                disabled={!!player}
                className={`w-24 h-24 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all shadow-2xl overflow-hidden
                  ${player 
                    ? 'bg-[#0a1a14] border-gold/50 text-white' 
                    : 'bg-black/60 border-white/10 hover:border-gold/50 text-white/40 cursor-pointer'
                  }`}
              >
                {player ? (
                  <>
                    <div className="w-10 h-10 bg-gold/10 rounded-full flex items-center justify-center">
                      <User className="w-6 h-6 text-gold" />
                    </div>
                    <span className="text-xs font-bold truncate max-w-full px-2">{player.name}</span>
                    {player.id === myId && <span className="text-[8px] bg-gold text-black px-1 rounded font-bold uppercase">You</span>}
                  </>
                ) : (
                  <>
                    <Shield className="w-8 h-8 opacity-20" />
                    <span className="text-[9px] font-bold uppercase tracking-widest opacity-50">Reserve</span>
                  </>
                )}
              </button>
            </motion.div>
          );
        })}
      </div>

      <div className="w-full max-w-sm mt-8 space-y-4">
        <div className="bg-[#0a1a14] backdrop-blur rounded-2xl p-6 border border-white/10">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold/60 mb-6 text-center">Players ({players.length}/4)</h3>
          <div className="space-y-4">
            {players.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`w-1.5 h-1.5 rounded-full ${p.seat ? 'bg-gold shadow-[0_0_8px_#c5a059]' : 'bg-white/20'}`} />
                  <span className="font-medium text-sm text-white/80">{p.name}</span>
                </div>
                {p.seat ? (
                   <span className="text-[9px] font-bold text-gold bg-gold/10 px-2 py-1 rounded-lg uppercase tracking-widest border border-gold/20">{p.seat}</span>
                ) : (
                   <span className="text-[9px] font-bold text-white/40 bg-white/5 px-2 py-1 rounded-lg uppercase tracking-widest">Waiting</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {allSeatsFilled && isCreator && (
          <motion.button
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={onStartGame}
            className="w-full bg-gold hover:bg-gold/90 text-black py-5 rounded-2xl font-bold text-lg transition-all shadow-xl shadow-gold/20 uppercase tracking-[0.2em]"
          >
            Start Royale
          </motion.button>
        )}
        
        {allSeatsFilled && !isCreator && (
           <p className="text-center text-gold/40 text-[10px] uppercase tracking-widest animate-pulse">Waiting for host...</p>
        )}
      </div>
    </motion.div>
  );
}
