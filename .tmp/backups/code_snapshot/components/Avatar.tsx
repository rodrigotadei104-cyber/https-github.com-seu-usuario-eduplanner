import React, { useState, useEffect } from 'react';

interface AvatarProps {
    url?: string | null;
    name: string;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'; // Tailwind based sizings
    className?: string;
    onClick?: () => void;
}

export const Avatar: React.FC<AvatarProps> = ({ url, name, size = 'md', className = '', onClick }) => {
    const [imageError, setImageError] = useState(false);

    useEffect(() => {
        setImageError(false);
    }, [url]);

    const sizeClasses = {
        xs: 'w-6 h-6 text-[10px]',
        sm: 'w-8 h-8 text-xs',
        md: 'w-10 h-10 text-sm',
        lg: 'w-12 h-12 text-base',
        xl: 'w-20 h-20 text-2xl',
        '2xl': 'w-32 h-32 text-4xl'
    };

    const currentSizeClass = sizeClasses[size] || sizeClasses.md;

    const initials = name
        ? name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
        : '??';

    const containerClasses = `relative inline-flex items-center justify-center rounded-full overflow-hidden flex-shrink-0 bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-200 font-bold ${currentSizeClass} ${className} ${onClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}`;

    return (
        <div className={containerClasses} onClick={onClick}>
            {url && !imageError ? (
                <img
                    src={url}
                    alt={name}
                    className="w-full h-full object-cover"
                    onError={() => setImageError(true)}
                />
            ) : (
                <span>{initials}</span>
            )}
        </div>
    );
};
