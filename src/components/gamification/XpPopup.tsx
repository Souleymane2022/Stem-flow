import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

type Popup = { id: number; amount: number };

const XpContext = createContext<{ push: (amount: number) => void } | null>(null);

export function XpPopupProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Popup[]>([]);

  const push = useCallback((amount: number) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, amount }]);
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 1500);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <XpContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-24 z-[80] flex flex-col items-center gap-1">
        <AnimatePresence>
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={{ y: 0, opacity: 1, scale: 0.9 }}
              animate={{ y: -60, opacity: 0, scale: 1.1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              className="animate-glow rounded-full border border-primary/40 bg-background/80 px-4 py-1.5 text-sm font-black text-primary"
            >
              +{item.amount} XP ∞
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </XpContext.Provider>
  );
}

export function useXpPopup() {
  return useContext(XpContext)?.push ?? (() => {});
}
