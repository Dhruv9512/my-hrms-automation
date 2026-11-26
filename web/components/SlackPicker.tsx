"use client";
// Searchable "Send update to" picker: yourself, your Slack channels, or any person.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

export type Dest = { id: string; label: string };
type Target = { id: string; label: string; kind: "me" | "channel" | "private" | "person"; sub?: string };
type LoadResult = { targets: Target[] } | { error: string; needsReconnect?: boolean; needsConnect?: boolean };

let cache: Promise<LoadResult> | null = null;
function loadTargets(): Promise<LoadResult> {
  if (!cache) {
    cache = fetch("/api/slack/targets", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => ({ error: "Could not load Slack channels" }));
    cache.then((r) => { if ("error" in r) cache = null; }); // retry next time on failure
  }
  return cache;
}

const ICON: Record<Target["kind"], string> = { me: "👤", channel: "#", private: "🔒", person: "@" };
const GROUPS: [string, Target["kind"][]][] = [["You", ["me"]], ["Channels", ["channel", "private"]], ["People", ["person"]]];
const CHANNEL_NAME = /^[a-z0-9._-]{1,80}$/;

export default function SlackPicker({ id, value, onChange, disabled }: {
  id: string; value: Dest; onChange: (d: Dest) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<LoadResult | null>(null);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadTargets().then(setData); }, []);

  const targets = data && "targets" in data ? data.targets : [];
  const failed = data && "error" in data ? data : null;

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^[#@]/, "");
    const match = (t: Target) => !q || t.label.toLowerCase().replace(/^[#@]/, "").includes(q) || (t.sub || "").toLowerCase().includes(q);
    const out = GROUPS.map(([title, kinds]) => ({ title, items: targets.filter((t) => kinds.includes(t.kind) && match(t)).slice(0, 50) }))
      .filter((g) => g.items.length);
    // Without the list (old connection / error), still allow typing a channel name.
    if (failed && CHANNEL_NAME.test(q)) out.push({ title: "Channel", items: [{ id: q, label: `#${q}`, kind: "channel" }] });
    return out;
  }, [targets, failed, query]);
  const flat = groups.flatMap((g) => g.items);

  useEffect(() => { setActive(0); }, [query, open]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function pick(t: Target) {
    onChange({ id: t.id, label: t.label });
    setOpen(false);
    setQuery("");
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { if (open && flat[active]) { e.preventDefault(); pick(flat[active]); } }
    else if (e.key === "Escape") { setOpen(false); setQuery(""); }
  }

  let i = -1;
  return (
    <div className="picker">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        autoComplete="off"
        disabled={disabled}
        placeholder={value.id ? value.label : "Search a channel or a person…"}
        value={open ? query : value.label}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onBlur={() => { setOpen(false); setQuery(""); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={onKey}
      />
      <span className="picker-caret" aria-hidden>▾</span>
      {open && (
        <div className="picker-list" id={`${id}-list`} role="listbox" ref={listRef}>
          {!data && <div className="picker-empty">Loading your Slack channels and people…</div>}
          {failed && (
            <div className="picker-empty">
              {failed.error}.{" "}
              {(failed.needsReconnect || failed.needsConnect) && (
                <a href="/api/slack/connect" onMouseDown={(e) => e.preventDefault()}>{failed.needsConnect ? "Connect Slack" : "Reconnect Slack"}</a>
              )}
              {failed.needsReconnect && <div className="small muted">Until then, type a channel name.</div>}
            </div>
          )}
          {data && !failed && flat.length === 0 && <div className="picker-empty">No match for “{query}”.</div>}
          {groups.map((g) => (
            <div key={g.title}>
              <div className="picker-group">{g.title}</div>
              {g.items.map((t) => {
                i += 1;
                const idx = i;
                return (
                  <div
                    key={`${t.kind}-${t.id}`}
                    data-i={idx}
                    role="option"
                    aria-selected={value.id === t.id}
                    className={`picker-opt${idx === active ? " active" : ""}`}
                    onMouseEnter={() => setActive(idx)}
                    onMouseDown={(e) => { e.preventDefault(); pick(t); }}
                  >
                    <span className="picker-icon">{ICON[t.kind]}</span>
                    <span className="picker-label">{t.label.replace(/^[#@]/, "")}</span>
                    {t.sub && <span className="muted small">{t.sub}</span>}
                    {value.id === t.id && <span className="picker-check">✓</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
