import React from 'react';

export interface AdminButtonProps {
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  id?: string;
  children: React.ReactNode;
  className?: string;
  tooltip?: string;
  active?: boolean;
}

export const AdminButton: React.FC<AdminButtonProps> = ({
  onClick,
  disabled,
  id,
  children,
  className = "",
  tooltip,
  active,
}) => {
  const style = {
    ['--admin-btn-bg' as any]: active ? '#5a5a5a' : '#4d4d4d',
    ['--admin-btn-bg-hover' as any]: active ? '#6a6a6a' : '#5e5e5e',
    ['--admin-btn-border' as any]: active ? '#7a7a7a' : '#6a6a6a',
  } as React.CSSProperties;

  return (
    <button
      id={id}
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      style={style}
      className={`
        flex flex-col items-center justify-center gap-2 px-2 py-3 rounded-xl text-[10px] sm:text-xs font-medium border transition-all duration-300
        bg-[var(--admin-btn-bg)] hover:bg-[var(--admin-btn-bg-hover)] border-[var(--admin-btn-border)] text-white
        ${active ? 'shadow-[0_0_10px_rgba(255,255,255,0.08)]' : ''}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:scale-95'}
        relative group
        ${className}
      `}
    >
      {children}
      {tooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[60] shadow-xl max-w-[280px] text-center leading-relaxed whitespace-normal">
          {tooltip}
        </div>
      )}
    </button>
  );
};
