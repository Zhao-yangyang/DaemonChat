"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import {
  Button,
  cn,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@daemon/ui";
import { ModelIcon } from "@/src/components/model-icon";

interface ModelComboboxProps {
  value: string;
  onChange: (modelId: string) => void;
  models: Array<{ id: string; name: string }>;
  loading?: boolean;
  placeholder?: string;
}

export function ModelCombobox({
  value,
  onChange,
  models,
  loading = false,
  placeholder = "搜索或输入模型 ID...",
}: ModelComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedModel = models.find((m) => m.id === value);
  const displayLabel = selectedModel
    ? selectedModel.name !== selectedModel.id
      ? `${selectedModel.name} (${selectedModel.id})`
      : selectedModel.id
    : value || placeholder;

  const trimmedSearch = search.trim();
  const exactMatch = models.some(
    (m) => m.id.toLowerCase() === trimmedSearch.toLowerCase()
  );

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {loading ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                加载模型列表...
              </span>
            ) : (
              <span className={!value ? "text-muted-foreground" : ""}>
                {displayLabel}
              </span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={placeholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {!loading && models.length === 0 && !trimmedSearch && (
              <CommandEmpty>暂无可用模型</CommandEmpty>
            )}
            {models.length > 0 && (
              <CommandGroup>
                {models
                  .filter((m) => {
                    if (!trimmedSearch) return true;
                    const q = trimmedSearch.toLowerCase();
                    return (
                      m.id.toLowerCase().includes(q) ||
                      m.name.toLowerCase().includes(q)
                    );
                  })
                  .map((m) => (
                    <CommandItem
                      key={m.id}
                      value={m.id}
                      onSelect={() => {
                        onChange(m.id);
                        setOpen(false);
                        setSearch("");
                      }}
                      className="flex items-center gap-3 py-2"
                    >
                      <Check
                        className={cn(
                          "size-4 shrink-0",
                          value === m.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-md">
                        <ModelIcon modelId={m.id} size={28} type="avatar" />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-sm font-medium">
                          {m.name !== m.id ? m.name : m.id}
                        </span>
                        {m.name !== m.id && (
                          <span className="truncate font-mono text-xs text-muted-foreground">
                            {m.id}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
              </CommandGroup>
            )}
            {trimmedSearch && !exactMatch && (
              <CommandGroup heading="自定义">
                <CommandItem
                  value={`__custom__:${trimmedSearch}`}
                  onSelect={() => {
                    onChange(trimmedSearch);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="flex items-center gap-3 py-2"
                >
                  <Check
                    className={cn(
                      "size-4 shrink-0",
                      value === trimmedSearch ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md">
                    <ModelIcon modelId={trimmedSearch} size={28} type="avatar" />
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    使用自定义模型: <code className="font-mono text-xs">{trimmedSearch}</code>
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
