/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Player, GameState, Seat } from './types';
import Lobby from './components/Lobby';
import GameBoard from './components/GameBoard';
import Sandbox from './components/Sandbox';
import { Trophy, Users, Play, TestTube2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

let socket: Socket;

export default function App() {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [view, setView] = useState<'HOME' | 'LOBBY' | 'GAME' | 'SANDBOX'>('HOME');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    socket = io();

    socket.on('roomJoined', ({ roomCode, players, gameState, adminId }) => {
      setPlayers(players);
      setGameState(gameState);
      setAdminId(adminId);
      setCurrentRoom(roomCode);
      setRoomCode(roomCode);
      setView('LOBBY');
    });

    socket.on('gameStateUpdate', (newGameState: GameState) => {
      setGameState(newGameState);
      setAdminId(newGameState.adminId);
      if (newGameState.status !== 'LOBBY') {
        setView('GAME');
      }
    });

    socket.on('kicked', () => {
      setError('You have been removed from the room by the admin');
      setTimeout(() => setError(null), 5000);
      setView('HOME');
      setCurrentRoom(null);
      setGameState(null);
      setAdminId(null);
    });

    socket.on('error', (msg: string) => {
      setError(msg);
      setTimeout(() => setError(null), 3000);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const createRoom = () => {
    if (!name) return setError('Please enter your name');
    socket.emit('createRoom', name);
  };

  const joinRoom = () => {
    if (!name || !roomCode) return setError('Please enter name and room code');
    socket.emit('joinRoom', { name, roomCode });
  };

  const claimSeat = (seat: Seat) => {
    if (!currentRoom) return;
    socket.emit('claimSeat', { roomCode: currentRoom, seat });
  };

  const startGame = () => {
    if (!currentRoom) return;
    socket.emit('startGame', currentRoom);
  };

  const addBot = (seat: Seat) => {
    if (!currentRoom) return;
    socket.emit('addBot', { roomCode: currentRoom, seat });
  };

  const bootPlayer = (playerId: string) => {
    if (!currentRoom) return;
    socket.emit('bootPlayer', { roomCode: currentRoom, playerId });
  };

  if (view === 'SANDBOX') {
    return <Sandbox onBack={() => setView('HOME')} />;
  }

  return (
    <div className="min-h-screen bg-deep-black text-white font-sans overflow-hidden flex flex-col items-center p-4">
      <AnimatePresence mode="wait">
        {view === 'HOME' && (
          <motion.div
            key="home"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-md bg-[#0a1a14] backdrop-blur-xl p-8 rounded-3xl border border-white/10 shadow-2xl mt-12"
          >
            <div className="text-center mb-8">
              <div className="inline-flex p-4 bg-gold/10 rounded-2xl mb-4 border border-gold/30">
                <Trophy className="w-10 h-10 text-gold" />
              </div>
              <h1 className="text-4xl font-serif italic text-gold tracking-tight mb-2">Karim’s Clubhouse Spades</h1>
              <p className="text-white/40 uppercase text-[10px] tracking-[0.2em] font-medium">Classic American Multiplayer</p>
            </div>

            <div className="space-y-6">
              <div className="space-y-4">
                <label className="text-[10px] font-bold uppercase tracking-widest text-gold opacity-60">Your Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name..."
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-1 focus:ring-gold/50 transition-all font-medium placeholder:text-white/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={createRoom}
                  className="bg-gold hover:bg-gold/90 text-black py-4 rounded-xl font-bold transition-all flex flex-col items-center justify-center gap-2 shadow-lg shadow-gold/10"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span className="text-xs uppercase tracking-widest">Create Room</span>
                </button>
                <button
                  onClick={() => setView('HOME')} // Dummy if needed
                  className="bg-white/5 hover:bg-white/10 text-white/80 py-4 rounded-xl font-bold border border-white/10 transition-all flex flex-col items-center justify-center gap-2"
                >
                  <Users className="w-5 h-5 text-gold/60" />
                  <span className="text-xs uppercase tracking-widest">Join Code</span>
                </button>
              </div>

              <div className="pt-4 border-t border-white/5 space-y-4">
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="CODE"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-center text-2xl font-mono tracking-[0.4em] focus:outline-none focus:ring-1 focus:ring-gold/50 text-gold"
                  maxLength={4}
                />
                <button
                  onClick={joinRoom}
                  className="w-full border border-white/20 hover:bg-white/5 text-white/80 py-4 rounded-xl font-bold transition-all text-xs uppercase tracking-widest"
                >
                  Join Game
                </button>
              </div>

              <button
                onClick={() => setView('SANDBOX')}
                className="w-full bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 py-3 rounded-xl font-medium border border-indigo-500/20 transition-all flex items-center justify-center gap-2 mt-4 text-[10px] uppercase tracking-widest"
              >
                <TestTube2 className="w-4 h-4" />
                Simulate 4 Players
              </button>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 text-red-400 text-sm text-center font-medium bg-red-400/10 py-2 rounded-lg"
              >
                {error}
              </motion.div>
            )}
          </motion.div>
        )}

        {view === 'LOBBY' && (
          <Lobby
            players={players}
            roomCode={currentRoom || ''}
            onClaimSeat={claimSeat}
            onAddBot={addBot}
            onStartGame={startGame}
            onBootPlayer={bootPlayer}
            myId={socket.id}
            adminId={adminId}
          />
        )}

        {view === 'GAME' && gameState && (
          <GameBoard
            gameState={gameState}
            mySeat={players.find(p => p.id === socket.id)?.seat || null}
            adminId={adminId}
            myId={socket.id}
            onPlayCard={(card) => socket.emit('playCard', { roomCode: currentRoom, card })}
            onSubmitBid={(bid) => socket.emit('submitBid', { roomCode: currentRoom, bid })}
            onNextRound={() => socket.emit('nextRound', currentRoom)}
            onBootPlayer={bootPlayer}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
