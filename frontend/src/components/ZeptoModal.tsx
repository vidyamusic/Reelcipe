import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingCart, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface ZeptoModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipeId: string | null;
}

export const ZeptoModal: React.FC<ZeptoModalProps> = ({ isOpen, onClose, recipeId }) => {
  const { user, session } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp' | 'building'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendPhone = async () => {
    if (!phoneNumber) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('http://localhost:8080/api/zepto/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id,
          phone_number: phoneNumber,
          user_token: session?.access_token,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start login');
      }

      setStep('otp');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('http://localhost:8080/api/zepto/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id,
          otp: otp,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to verify OTP');
      }

      setStep('building');
      
      // Simulate cart building time or wait for a websocket signal
      setTimeout(() => {
        onClose();
        setStep('phone');
      }, 3000);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4 pointer-events-none">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-md glass-panel p-6 pointer-events-auto"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                    <ShoppingCart className="w-4 h-4 text-purple-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white">Push to Zepto</h3>
                </div>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-white transition-colors p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {step === 'phone' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-400">
                    Enter your Zepto phone number to authenticate. A headless browser will handle the login.
                  </p>
                  <div>
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="10-digit mobile number"
                      className="w-full bg-surface border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    />
                  </div>
                  <button
                    onClick={handleSendPhone}
                    disabled={loading || !phoneNumber}
                    className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-50 flex justify-center items-center h-12"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send OTP'}
                  </button>
                </div>
              )}

              {step === 'otp' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-400">
                    We've sent an OTP to {phoneNumber}. Enter it below to allow the agent to build your cart.
                  </p>
                  <div>
                    <input
                      type="text"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder="Enter OTP"
                      maxLength={6}
                      className="w-full bg-surface border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 tracking-widest text-center text-lg font-mono"
                    />
                  </div>
                  <button
                    onClick={handleVerifyOTP}
                    disabled={loading || !otp}
                    className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-50 flex justify-center items-center h-12"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify & Build Cart'}
                  </button>
                </div>
              )}

              {step === 'building' && (
                <div className="py-8 flex flex-col items-center justify-center space-y-4">
                  <div className="relative">
                    <div className="w-16 h-16 border-4 border-purple-500/30 rounded-full"></div>
                    <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin absolute inset-0"></div>
                    <ShoppingCart className="w-6 h-6 text-purple-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <p className="text-purple-400 font-medium animate-pulse">Building your Zepto cart...</p>
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};
