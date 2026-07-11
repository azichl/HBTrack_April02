import React from 'react';

interface HoubaraIconProps {
  size?: number;
  className?: string;
  color?: string; 
}

/**
 * Custom Houbara Bustard icon using the user's uploaded PNG.
 * Since the PNG has a solid white background, we use CSS blend modes.
 */
export const HoubaraIcon: React.FC<HoubaraIconProps> = ({ 
  size = 24, 
  className = '', 
  color = 'currentColor'
}) => {
  // If the icon is requested to be white explicitly (e.g. sidebar), invert it.
  // Otherwise, use dark:invert to automatically make the black bird white in dark mode.
  const isWhite = color === 'white' || color === '#ffffff' || color === '#FFF';
  
  const finalClassName = `${className} ${isWhite ? 'invert brightness-200' : 'dark:invert'}`;

  return (
    <img
      src="/houbara-icon-transparent.png"
      width={size}
      height={size}
      className={finalClassName.trim()}
      style={{ objectFit: 'contain' }}
      alt="Houbara Bustard"
    />
  );
};

export default HoubaraIcon;
