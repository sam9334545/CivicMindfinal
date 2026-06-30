import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", type = "text", ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={`flex h-10 w-full rounded-[12px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#F5F7FA] placeholder-[#9AA3B8]/60 focus:outline-none focus:ring-2 focus:ring-[#22C55E]/40 focus:border-[#22C55E]/50 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 ${className}`}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
