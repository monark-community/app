"use client";

// `Chip` now lives in the shared UI layer so it can be reused outside the
// fields toolkit (multi-select, token inputs, etc.). Re-exported here so the
// toolkit's existing imports (`../chips`) keep working.
export { Chip, AddChip, ChipList, type ChipTone } from "@/components/ui/chip";
