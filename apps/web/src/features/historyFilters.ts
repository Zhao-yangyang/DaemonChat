import type { MemoryItem, TranscriptEvent } from "@daemon/domain";

type MemorySensitivityFilter = "all" | MemoryItem["sensitivity"];
type MemoryEligibilityFilter = "all" | "eligible" | "ineligible";

export function filterMemoryItems(
  items: MemoryItem[],
  input: {
    query: string;
    sensitivity: MemorySensitivityFilter;
    contextEligible: MemoryEligibilityFilter;
  },
): MemoryItem[] {
  const query = input.query.trim().toLowerCase();

  return items.filter((item) => {
    if (input.sensitivity !== "all" && item.sensitivity !== input.sensitivity) {
      return false;
    }

    if (input.contextEligible === "eligible" && !item.contextEligible) {
      return false;
    }
    if (input.contextEligible === "ineligible" && item.contextEligible) {
      return false;
    }

    if (!query) return true;

    const haystack = [item.content, item.type, item.sensitivity, ...(item.tags ?? [])]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
}

type TranscriptTypeFilter = "all" | TranscriptEvent["type"];

const extractTranscriptText = (event: TranscriptEvent): string => {
  if (typeof event.content === "string") {
    return event.content;
  }
  if (event.content && typeof event.content === "object") {
    const textValue = (event.content as { text?: string }).text;
    if (typeof textValue === "string") {
      return textValue;
    }
  }
  return JSON.stringify(event.content);
};

export function filterTranscriptEvents(
  events: TranscriptEvent[],
  input: {
    query: string;
    type: TranscriptTypeFilter;
  },
): TranscriptEvent[] {
  const query = input.query.trim().toLowerCase();

  return events.filter((event) => {
    if (input.type !== "all" && event.type !== input.type) {
      return false;
    }

    if (!query) return true;

    const haystack = `${event.type} ${extractTranscriptText(event)}`.toLowerCase();
    return haystack.includes(query);
  });
}

export function paginateItems<T>(
  items: T[],
  input: {
    page: number;
    pageSize: number;
  },
): {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
} {
  const safePageSize = Math.max(1, input.pageSize);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const page = Math.min(Math.max(1, input.page), totalPages);

  const start = (page - 1) * safePageSize;
  const end = start + safePageSize;

  return {
    items: items.slice(start, end),
    page,
    pageSize: safePageSize,
    total,
    totalPages,
  };
}
