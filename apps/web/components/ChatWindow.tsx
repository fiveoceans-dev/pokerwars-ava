"use client";

import { useState, useRef, useEffect } from "react";
import useIsMobile from "../hooks/useIsMobile";

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
}

export default function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const isMobile = useIsMobile();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    
    const newMessage: ChatMessage = {
      id: Math.random().toString(36).substring(7),
      sender: "You",
      text: inputValue.trim(),
      timestamp: Date.now(),
    };
    
    setMessages(prev => [...prev, newMessage]);
    setInputValue("");
  };

  return (
    <div className="w-full h-full flex flex-col text-xs text-white/90">
      {/* Messages Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-white/10"
      >
        {messages.length === 0 ? (
          <div className="text-white/30 italic text-center mt-4">
            No messages yet
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="break-words">
              <span className="font-bold text-blue-400 mr-1">{msg.sender}:</span>
              <span>{msg.text}</span>
            </div>
          ))
        )}
      </div>

      {/* Input Area */}
      <div className="p-1 border-t border-white/5">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Chat..."
          className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 outline-none focus:border-blue-500/50 transition-colors"
        />
      </div>
    </div>
  );
}
