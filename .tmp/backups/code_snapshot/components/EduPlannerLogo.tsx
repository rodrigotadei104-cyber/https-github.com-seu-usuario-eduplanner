import React from 'react';

export const EduPlannerLogo: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="100" height="100" rx="22" fill="#1e40af" /> 
      {/* Abstract stylized 'E' / Planner Bars */}
      <rect x="20" y="22" width="45" height="12" rx="6" fill="white" />
      <rect x="20" y="44" width="35" height="12" rx="6" fill="white" />
      <rect x="20" y="66" width="45" height="12" rx="6" fill="white" />
      
      {/* Right side connectivity / Structure to balance the logo like the reference */}
      <path d="M72 22C75.3137 22 78 24.6863 78 28V72C78 75.3137 75.3137 78 72 78H68C64.6863 78 62 75.3137 62 72V28C62 24.6863 64.6863 22 68 22H72Z" fill="white" fillOpacity="0.9" />
    </svg>
  );
};