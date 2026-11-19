import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { parseLatLng, searchCities, type City } from "@watchfire/core";
import type { WatchPlace } from "../session.ts";
import { pointer, stepCursor, TextInput } from "../ui.tsx";

/**
 * Type a city, pick with ↑↓ and Enter. "lat, lng" works for places the list doesn't have.
 * With `fallback`, Enter on an empty line picks it.
 */
export function CityPicker(props: {
  prompt: string;
  fallback?: WatchPlace;
  onPick(place: WatchPlace): void;
  onCancel(): void;
}) {
  const [query, setQuery] = useState("");
  // The matches, and the query they answer (which trails `query` by the debounce).
  const [found, setFound] = useState<{ for: string; list: City[] }>({ for: "", list: [] });
  const results = found.list;
  const [sel, setSel] = useState(0);

  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      const r = query.trim().length >= 2 ? await searchCities(query, 6) : [];
      if (live) {
        setFound({ for: query, list: r });
        setSel(0);
      }
    }, 120);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query]);

  useInput((_, key) => {
    setSel((s) => stepCursor(key, s, results.length));
  });

  /** Pick from what was typed. The list may lag the text (debounce, or a pasted line + Enter). */
  const submit = async (typed: string) => {
    const ll = parseLatLng(typed);
    if (ll) return props.onPick({ name: `${ll.lat.toFixed(2)}, ${ll.lng.toFixed(2)}`, label: "a place of your choosing", ...ll });
    if (!typed.trim()) return props.fallback ? props.onPick(props.fallback) : undefined;
    const fresh = typed === found.for && results.length > 0;
    const c = fresh ? results[sel] : (await searchCities(typed, 1))[0];
    if (c) return props.onPick({ name: c.name, label: c.label, lat: c.lat, lng: c.lng });
  };

  return (
    <Box flexDirection="column">
      <TextInput label={props.prompt} max={60} onChange={setQuery} onSubmit={submit} onCancel={props.onCancel} />
      <Box flexDirection="column" marginTop={1} minHeight={6}>
        {results.map((c, i) => (
          <Text key={`${c.label}${c.lat}`} color={i === sel ? "#fbbf24" : "#a8a29e"}>
            {pointer(i === sel)}
            {c.label}
          </Text>
        ))}
        {query.trim().length >= 2 && results.length === 0 && !parseLatLng(query) ? (
          <Text color="#78716c">  No town by that name. Try a bigger city nearby, or type "lat, lng".</Text>
        ) : null}
        {!query.trim() && props.fallback ? <Text color="#78716c">  Enter on its own: {props.fallback.label}</Text> : null}
      </Box>
      <Text color="#78716c">↑↓ choose · Enter pick · Esc back</Text>
    </Box>
  );
}
