export const baseStyles = `
      body { font-family: 'Quicksand', sans-serif; background-color: #fff7ed; -webkit-tap-highlight-color: transparent; }
      h1, h2, h3, button, .font-kiddy { font-family: 'Fredoka', sans-serif; }
      
      .anim-enter { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
      .anim-pop { animation: popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
      @keyframes slideUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes popIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      
      .glass { background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
      .btn-bounce:active { transform: scale(0.95); }
      
      /* Mobile Optimizations */
      .no-scrollbar::-webkit-scrollbar { display: none; }
      .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
    `;
