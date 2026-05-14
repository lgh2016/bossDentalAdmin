import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Combobox con autocomplete + opción "Crear nuevo".
 * options = [{ value, label, description? }]
 */
export default function Combobox({ value, onChange, options, placeholder = "Buscar…", emptyText = "Sin resultados", onCreateNew, createLabel = "Crear nuevo", testId }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q) || (o.description || "").toLowerCase().includes(q));
  }, [query, options]);

  const showCreate = onCreateNew && query.trim() && !options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          data-testid={testId}
          type="button"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected?.label || placeholder}</span>
          <ChevronDown size={14} className="ml-2 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} data-testid={`${testId}-input`} />
          <CommandList>
            {filtered.length === 0 && !showCreate && <CommandEmpty>{emptyText}</CommandEmpty>}
            {filtered.length > 0 && (
              <CommandGroup>
                {filtered.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    value={opt.value}
                    onSelect={() => { onChange(opt.value, opt); setOpen(false); setQuery(""); }}
                    data-testid={`${testId}-option-${opt.value}`}
                  >
                    <Check size={13} className={cn("mr-2", value === opt.value ? "opacity-100" : "opacity-0")} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{opt.label}</p>
                      {opt.description && <p className="text-[11px] text-muted-foreground truncate">{opt.description}</p>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {showCreate && (
              <CommandGroup heading="Acciones">
                <CommandItem
                  onSelect={() => {
                    const created = onCreateNew(query.trim());
                    if (created) onChange(created.value, created);
                    setOpen(false); setQuery("");
                  }}
                  data-testid={`${testId}-create`}
                >
                  <Plus size={13} className="mr-2 text-primary" />
                  <span className="text-sm">{createLabel}: <span className="font-medium">{query.trim()}</span></span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
