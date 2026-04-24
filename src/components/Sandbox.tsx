import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameState, Player, Seat, Card } from '../types';
import GameBoard from './GameBoard';
import Lobby from './Lobby';
import { LayoutGrid, X, Smartphone, Monitor } from 'lucide-react';
import { motion } from 'motion/react';

interface SandboxProps {
  onBack: () => void;
}

const SEATS: Seat[] = ['NORTH', 'SOUTH', 'EAST', 'WEST'];

export default function Sandbox({ onBack }: SandboxProps) {
  const [activePlayerIndex, setActivePlayerIndex] = useState(0);
  const [sockets, setSockets] = useState<Socket[]>([]);
  const [playerStates, setPlayerStates] = useState<{
    players: Player[];
    gameState: GameState | null;
    currentRoom: string | null;
    socketId: string | null;
  }[]>(Array(4).fill({ players: [], gameState: null, currentRoom: null, socketId: null }));

  const [roomCode, setRoomCode] = useState<string | null>(null);

  useEffect(() => {
    const newSockets: Socket[] = [];
    const names = ['North Bot', 'South Bot', 'East Bot', 'West Bot'];

    const init = async () => {
      for (let i = 0; i < 4; i++) {
        const socket = io();
        newSockets.push(socket);

        socket.on('connect', () => {
          setPlayerStates(prev => {
            const next = [...prev];
            next[i] = { ...next[i], socketId: socket.id || null };
            return next;
          });
        });

        socket.on('roomJoined', ({ roomCode, players, gameState }) => {
          setRoomCode(roomCode);
          setPlayerStates(prev => {
            const next = [...prev];
            next[i] = { ...next[i], players, gameState, currentRoom: roomCode };
            return next;
          });
        });

        socket.on('gameStateUpdate', (newGameState: GameState) => {
          setPlayerStates(prev => {
            const next = [...prev];
            next[i] = { ...next[i], gameState: newGameState };
            return next;
          });
        });
      }

      setSockets(newSockets);

      newSockets[0].emit('createRoom', names[0]);

      newSockets[0].on('roomJoined', ({ roomCode }) => {
        for (let i = 1; i < 4; i++) {
          newSockets[i].emit('joinRoom', { name: names[i], roomCode });
        }

        setTimeout(() => {
          newSockets[0].emit('claimSeat', { roomCode, seat: 'NORTH' });
          newSockets[1].emit('claimSeat', { roomCode, seat: 'SOUTH' });
          newSockets[2].emit('claimSeat', { roomCode, seat: 'EAST' });
          newSockets[3].emit('claimSeat', { roomCode, seat: 'WEST' });
        }, 500);
      });
    };

    init();

    return () => {
      newSockets.forEach(s => s.disconnect());
    };
  }, []);

  const handlePlayCard = (card: Card) => {
    const socket = sockets[activePlayerIndex];
    socket.emit('playCard', { roomCode, card });
  };

  const handleSubmitBid = (bid: number) => {
    const socket = sockets[activePlayerIndex];
    socket.emit('submitBid', { roomCode, bid });
  };

  const handleStartGame = () => {
    sockets[0].emit('startGame', roomCode);
  };

  const handleNextRound = () => {
    sockets[0].emit('nextRound', roomCode);
  };

  const activeState = playerStates[activePlayerIndex];
  const mySeat = activeState.players.find(p => p.id === activeState.socketId)?.seat || null;

  return (
    <div className="fixed inset-0 bg-deep-black z-50 flex flex-col font-sans">
      {/* Top Controls */}
      <div className="bg-[#0a1a14] p-4 border-b border-white/10 flex justify-between items-center shadow-lg">
        <div className="flex gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-lg border border-white/10 transition-colors">
            <X className="w-5 h-5 text-gold" />
          </button>
          <div className="flex flex-col">
             <h2 className="text-xs font-bold text-gold tracking-widest uppercase">Simulator</h2>
             <p className="text-[9px] text-white/30 uppercase tracking-tighter">4-way split connection</p>
          </div>
        </div>

        <div className="flex gap-1.5 bg-black/60 p-1.5 rounded-xl border border-white/10">
          {SEATS.map((seat, i) => (
            <button
              key={seat}
              onClick={() => setActivePlayerIndex(i)}
              className={`px-4 py-2 rounded-lg text-[10px] font-bold transition-all uppercase tracking-widest 
                ${activePlayerIndex === i ? 'bg-gold text-black shadow-lg shadow-gold/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
            >
              {seat[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        {/* Helper Instructions for Test Mode */}
        {activeState.gameState === null && (
           <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center space-y-6">
              <div className="inline-flex p-6 bg-gold/10 rounded-full border border-gold/20">
                 <Smartphone className="w-12 h-12 text-gold opacity-60" />
              </div>
              <div className="max-w-xs">
                <h3 className="text-xl font-serif italic mb-2 text-gold">Multi-Perspective Test</h3>
                <p className="text-xs text-white/40 leading-relaxed uppercase tracking-widest">
                  Observe the game flow from each player's view at the same time.
                </p>
              </div>
              {playerStates.every(s => s.players.length === 4 && s.players.every(p => p.seat)) && activePlayerIndex === 0 && (
                <button 
                  onClick={handleStartGame}
                  className="bg-gold px-10 py-4 rounded-xl font-bold text-black shadow-2xl hover:scale-105 active:scale-95 transition-all text-xs uppercase tracking-[0.2em]"
                >
                   Begin Simulation
                </button>
              )}
           </div>
        )}

        <div className="w-full h-full">
          {activeState.players.length > 0 && activeState.gameState === null ? (
            <Lobby
              players={activeState.players}
              roomCode={roomCode || ''}
              onClaimSeat={() => {}} // Auto handled in sandbox
              onAddBot={() => {}} // Bots not used in sandbox simulation mode
              onStartGame={handleStartGame}
              myId={activeState.socketId || ''}
            />
          ) : activeState.gameState ? (
            <GameBoard
              gameState={activeState.gameState}
              mySeat={mySeat}
              onPlayCard={handlePlayCard}
              onSubmitBid={handleSubmitBid}
              onNextRound={handleNextRound}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
