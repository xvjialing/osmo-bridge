import { useRef, type ComponentProps } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

export function SearchField({
  value,
  onValueChange,
  label,
  placeholder,
  disabled,
  onCompositionStart,
  onCompositionEnd,
}: {
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  onCompositionStart?: ComponentProps<"input">["onCompositionStart"];
  onCompositionEnd?: ComponentProps<"input">["onCompositionEnd"];
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="search">
      <Search aria-hidden="true" />
      <Input
        ref={input}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
      />
      {value && (
        <button
          disabled={disabled}
          aria-label={`清除${label}`}
          onClick={() => {
            onValueChange("");
            input.current?.focus();
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
