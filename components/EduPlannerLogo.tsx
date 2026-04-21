import React from 'react';

export const EduPlannerLogo: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={`flex items-center justify-center bg-blue-700 rounded-xl ${className}`}>
      <span className="text-white font-black text-2xl tracking-tighter">EP</span>
    </div>
  );
};