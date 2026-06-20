import { useState } from "react";
import { Check, ChevronsUpDown, MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const GHANA_REGIONS = [
  { region: "Greater Accra",  capital: "Accra" },
  { region: "Ashanti",        capital: "Kumasi" },
  { region: "Western",        capital: "Sekondi-Takoradi" },
  { region: "Central",        capital: "Cape Coast" },
  { region: "Eastern",        capital: "Koforidua" },
  { region: "Northern",       capital: "Tamale" },
  { region: "Upper East",     capital: "Bolgatanga" },
  { region: "Upper West",     capital: "Wa" },
  { region: "Volta",          capital: "Ho" },
  { region: "Bono",           capital: "Sunyani" },
  { region: "Bono East",      capital: "Techiman" },
  { region: "Ahafo",          capital: "Goaso" },
  { region: "Western North",  capital: "Sefwi Wiawso" },
  { region: "Savannah",       capital: "Damongo" },
  { region: "North East",     capital: "Nalerigu" },
  { region: "Oti",            capital: "Dambai" },
] as const;

interface GhanaRegionPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function GhanaRegionPicker({
  value,
  onChange,
  placeholder = "Select city / region capital",
  className,
  disabled,
}: GhanaRegionPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = GHANA_REGIONS.find((r) => r.capital === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between rounded-[20px] font-normal h-10 px-3",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className="flex items-center gap-2 truncate min-w-0">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm">
              {selected
                ? `${selected.capital} — ${selected.region} Region`
                : placeholder}
            </span>
          </span>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {value && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onChange(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onChange(""); } }}
                className="rounded-full hover:bg-muted p-0.5 cursor-pointer"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search region or capital city…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No region found.</CommandEmpty>
            <CommandGroup heading="Ghana — All 16 Regional Capitals">
              {GHANA_REGIONS.map((r) => (
                <CommandItem
                  key={r.capital}
                  value={`${r.capital} ${r.region}`}
                  onSelect={() => {
                    onChange(value === r.capital ? "" : r.capital);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === r.capital ? "opacity-100 text-primary" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">{r.capital}</span>
                    <span className="text-xs text-muted-foreground">{r.region} Region</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
