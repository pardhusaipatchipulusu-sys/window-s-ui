import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpen, LoaderCircle } from "lucide-react";
import { motion } from "framer-motion";
import "./LyricsView.css";

interface LyricsRecord {
	trackName: string;
	artistName: string;
	plainLyrics: string | null;
	syncedLyrics: string | null;
	instrumental: boolean;
}

interface LyricLine {
	time: number | null;
	text: string;
}

interface LyricsViewProps {
	title: string;
	artist: string;
	durationMs: number;
	positionMs: number;
	positionUpdatedAt: number;
	isPlaying: boolean;
	onClose: () => void;
}

let retryAfterUntil = 0;

function parseSyncedLyrics(value: string): LyricLine[] {
	const lines: LyricLine[] = [];
	for (const rawLine of value.split(/\r?\n/)) {
		const matches = [...rawLine.matchAll(/\[(\d{2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
		const text = rawLine.replace(/\[\d{2}:\d{2}(?:[.:]\d{1,3})?\]/g, "").trim();
		if (matches.length) {
			for (const match of matches) {
				const fraction = match[3] ? Number(`0.${match[3]}`) * 1000 : 0;
				lines.push({ time: Number(match[1]) * 60_000 + Number(match[2]) * 1000 + fraction, text });
			}
		} else if (text) lines.push({ time: null, text });
	}
	return lines.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
}

export function LyricsView({ title, artist, durationMs, positionMs, positionUpdatedAt, isPlaying, onClose }: LyricsViewProps) {
	const [record, setRecord] = useState<LyricsRecord | null>(null);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(true);
	const [, setPlaybackTick] = useState(0);
	const activeLineRef = useRef<HTMLDivElement>(null);
	const requestKey = `${artist}\u0000${title}`;

	useEffect(() => {
		const controller = new AbortController();
		let alive = true;
		setRecord(null);
		setError("");
		setLoading(true);
		const remaining = Math.ceil((retryAfterUntil - Date.now()) / 1000);
		if (remaining > 0) {
			setError("Lyrics search is temporarily rate limited. Please try again shortly.");
			setLoading(false);
			return () => controller.abort();
		}
		const params = new URLSearchParams({ track_name: title, artist_name: artist });
		if (durationMs > 0) params.set("duration", String(Math.round(durationMs / 1000)));
		fetch(`https://lrclib.net/api/get?${params.toString()}`, {
			headers: { "Lrclib-Client": "Orbix/0.1.1" },
			signal: controller.signal
		}).then(async (response) => {
			if (response.status === 429) {
				const seconds = Math.max(1, Number(response.headers.get("Retry-After")) || 30);
				retryAfterUntil = Date.now() + seconds * 1000;
				throw new Error(`Lyrics search is temporarily rate limited. Try again in ${seconds} seconds.`);
			}
			if (response.status === 404) throw new Error("No lyrics were found for this track.");
			if (!response.ok) throw new Error("Lyrics could not be loaded right now.");
			return await response.json() as LyricsRecord;
		}).then((data) => {
			if (alive) setRecord(data);
		}).catch((reason: unknown) => {
			if (!alive || (reason instanceof DOMException && reason.name === "AbortError")) return;
			setError(reason instanceof Error ? reason.message : "Lyrics could not be loaded right now.");
		}).finally(() => { if (alive) setLoading(false); });
		return () => { alive = false; controller.abort(); };
	}, [requestKey, title, artist, durationMs]);

	useEffect(() => {
		if (!isPlaying) return;
		const interval = window.setInterval(() => setPlaybackTick((tick) => tick + 1), 250);
		return () => window.clearInterval(interval);
	}, [isPlaying]);

	const lines = useMemo(() => {
		if (record?.syncedLyrics) return parseSyncedLyrics(record.syncedLyrics);
		return (record?.plainLyrics || "").split(/\r?\n/).map((text) => ({ time: null, text }));
	}, [record]);
	const currentPosition = Math.min(positionMs + (isPlaying ? Math.max(0, Date.now() - (positionUpdatedAt || Date.now())) : 0), durationMs || Infinity);
	const activeIndex = lines.reduce((active, line, index) => line.time !== null && line.time <= currentPosition ? index : active, -1);
	const isSynced = Boolean(record?.syncedLyrics);

	useEffect(() => {
		if (isSynced && activeIndex >= 0) activeLineRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
	}, [activeIndex, isSynced]);

	return <motion.section className="lyrics-view" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} onClick={(event) => event.stopPropagation()}>
		<header className="lyrics-header">
			<button className="lyrics-back" onClick={onClose} aria-label="Back to music controls"><ArrowLeft size={15} /></button>
			<div className="lyrics-heading"><span><BookOpen size={14} /></span><div><strong>Lyrics</strong><small>{title} · {artist}</small></div></div>
			<span className="lyrics-sync-label">{isSynced ? "SYNCED" : "LYRICS"}</span>
		</header>
		<div className="lyrics-scroll" aria-live="polite">
			{loading ? <div className="lyrics-state"><LoaderCircle size={17} className="lyrics-spinner" />Finding lyrics…</div>
				: error ? <div className="lyrics-state">{error}</div>
					: record?.instrumental && !record.plainLyrics && !record.syncedLyrics ? <div className="lyrics-state">This track is marked as instrumental.</div>
						: lines.length ? lines.map((line, index) => <div key={`${line.time ?? "plain"}-${index}`} ref={index === activeIndex ? activeLineRef : undefined} className={`lyrics-line ${index === activeIndex && isSynced ? "active" : ""}`}>{line.text || "♪"}</div>)
							: <div className="lyrics-state">No lyrics are available for this track.</div>}
		</div>
		<footer className="lyrics-footer">Lyrics provided by LRCLIB · shown only when you open this view</footer>
	</motion.section>;
}
