import { useEffect, useRef, useState } from "react";
import { Calendar, Clock, CloudSun, Cpu, StickyNote, BatteryFull, EyeOff, Pin, Plus, Trash2, Sparkles, X } from "lucide-react";
import { motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { applyTheme, hexToHsl } from "../../theme";
import type { DesktopWidget, DesktopWidgetKind } from "./types";
import "./WidgetManager.css";

const OPTIONS: { kind: DesktopWidgetKind; title: string; description: string; Icon: typeof Clock }[] = [
	{ kind: "clock", title: "Clock & date", description: "Large time, weekday and date", Icon: Clock },
	{ kind: "calendar", title: "Calendar", description: "Month view and today marker", Icon: Calendar },
	{ kind: "weather", title: "Weather", description: "Current conditions at your location", Icon: CloudSun },
	{ kind: "system", title: "System monitor", description: "CPU and memory at a glance", Icon: Cpu },
	{ kind: "notes", title: "Quick note", description: "A small note you can edit on the desktop", Icon: StickyNote },
	{ kind: "battery", title: "Battery", description: "Laptop charge and power state", Icon: BatteryFull }
];

const COLOR_THEMES = [
	{ name: "Obsidian", color: "#8b95a7", saturation: 0.08, brightness: 0.12 },
	{ name: "Ocean", color: "#16a8c7", saturation: 0.58, brightness: 0.16 },
	{ name: "Sapphire", color: "#3978ef", saturation: 0.62, brightness: 0.16 },
	{ name: "Violet", color: "#9161ed", saturation: 0.58, brightness: 0.16 },
	{ name: "Lavender", color: "#b087df", saturation: 0.42, brightness: 0.19 },
	{ name: "Rose", color: "#e85e9d", saturation: 0.5, brightness: 0.16 },
	{ name: "Ruby", color: "#e34b5b", saturation: 0.58, brightness: 0.15 },
	{ name: "Ember", color: "#ee743c", saturation: 0.6, brightness: 0.16 },
	{ name: "Amber", color: "#d89a34", saturation: 0.48, brightness: 0.17 },
	{ name: "Forest", color: "#329b61", saturation: 0.55, brightness: 0.15 },
	{ name: "Mint", color: "#37ad91", saturation: 0.48, brightness: 0.17 },
	{ name: "Arctic", color: "#66b9d9", saturation: 0.32, brightness: 0.18 }
];

function NoteEditor({ value, onSave }: { value: string; onSave: (note: string) => void }) {
	const [draft, setDraft] = useState(value || "Write a quick note…");
	useEffect(() => setDraft(value || "Write a quick note…"), [value]);
	return <textarea className="widget-manager-note-editor" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => onSave(draft)} placeholder="Write a note…" aria-label="Edit desktop note" />;
}

interface WidgetManagerProps {
	widgets: DesktopWidget[];
	onChange: (next: DesktopWidget[]) => void;
	arranging: boolean;
	onArrange: (value: boolean) => void;
	onClose: () => void;
}

export function WidgetManager({ widgets, onChange, arranging, onArrange, onClose }: WidgetManagerProps) {
	const [selectedTheme, setSelectedTheme] = useState(() => localStorage.getItem("bloom-theme-color") || "#6B5290");
	const saveThemeTimer = useRef<number | null>(null);
	const applyColorTheme = async (color: string, saturation = 0.62, brightness = 0.16) => {
		setSelectedTheme(color);
		const opacity = Number(localStorage.getItem("bloom-notch-opacity") || localStorage.getItem("bloom-theme-opacity") || "0.8");
		const values: Record<string, string> = {
			"bloom-theme-mode": "custom",
			"bloom-theme-color": color,
			"bloom-theme-saturation": String(saturation),
			"bloom-theme-brightness": String(brightness)
		};
		for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
		applyTheme("custom", color, opacity, saturation, brightness);
		if (saveThemeTimer.current !== null) window.clearTimeout(saveThemeTimer.current);
		saveThemeTimer.current = window.setTimeout(() => {
			for (const [key, value] of Object.entries(values)) invoke("save_setting", { key, value }).catch(console.error);
			saveThemeTimer.current = null;
		}, 180);
	};
	const add = (kind: DesktopWidgetKind) => {
		if (widgets.some((widget) => widget.kind === kind)) return;
		const index = widgets.length;
		onChange([...widgets, { id: `${kind}-${Date.now()}`, kind, x: Math.min(72, 5 + index * 7), y: Math.min(75, 20 + index * 6), pinned: true, note: "Write a quick note…" }]);
		onArrange(true);
	};
	const update = (id: string, values: Partial<DesktopWidget>) => onChange(widgets.map((widget) => widget.id === id ? { ...widget, ...values } : widget));
	const remove = (id: string) => onChange(widgets.filter((widget) => widget.id !== id));
	const available = OPTIONS.filter((option) => !widgets.some((widget) => widget.kind === option.kind));

	return (
		<motion.section className="widget-manager-panel" initial={{ opacity: 0, y: -7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -7 }}>
			<header className="widget-manager-header"><div className="widget-manager-title"><span><Sparkles size={16} /></span><div><strong>Customize Orbix</strong><small>Choose a notch theme and arrange desktop widgets</small></div></div><div className="widget-manager-header-actions"><button className={`widget-arrange-button ${arranging ? "active" : ""}`} onClick={() => onArrange(!arranging)}><Pin size={13} />{arranging ? "Done arranging" : "Arrange on screen"}</button><button className="widget-manager-close" title="Close customization" onClick={() => { onArrange(false); onClose(); }}><X size={16} /></button></div></header>
			{arranging && <div className="widget-arrange-hint">Drag a widget by its top bar. Your placement is saved when you release it.</div>}
			<div className="widget-manager-body">
				<div className="widget-manager-section-title">Notch color themes <span>{COLOR_THEMES.length} + custom</span></div>
				<div className="widget-theme-grid">{COLOR_THEMES.map((theme) => <button key={theme.name} className={`widget-theme-swatch ${selectedTheme.toLowerCase() === theme.color.toLowerCase() ? "selected" : ""}`} onClick={() => void applyColorTheme(theme.color, theme.saturation, theme.brightness)} title={`${theme.name} theme`} aria-label={`Apply ${theme.name} theme`} aria-pressed={selectedTheme.toLowerCase() === theme.color.toLowerCase()}><i style={{ background: theme.color }} /><span>{theme.name}</span></button>)}</div>
				<label className="widget-custom-color"><span>Pick any color</span><input type="color" value={selectedTheme} onChange={(event) => { const color = event.target.value; const hsl = hexToHsl(color); void applyColorTheme(color, hsl.s / 100, hsl.l / 100); }} aria-label="Choose a custom notch color" /></label>
				<div className="widget-manager-section-title">Your widgets <span>{widgets.length}</span></div>
				{widgets.length === 0 ? <div className="widget-manager-empty">Add a widget below. It will appear on your desktop where you can move it.</div> : <div className="widget-manager-list">{widgets.map((widget) => {
					const option = OPTIONS.find((entry) => entry.kind === widget.kind)!;
					const Icon = option.Icon;
					return <div className="widget-manager-entry" key={widget.id}><article className="widget-manager-row"><span className="widget-manager-row-icon"><Icon size={16} /></span><div className="widget-manager-row-copy"><strong>{option.title}</strong><small>{widget.pinned ? `Pinned · ${Math.round(widget.x)}% across, ${Math.round(widget.y)}% down` : "Hidden from desktop"}</small></div><button title={widget.pinned ? "Unpin and hide from desktop" : "Pin on desktop"} aria-label={widget.pinned ? "Unpin widget" : "Pin widget"} onClick={() => update(widget.id, { pinned: !widget.pinned })}>{widget.pinned ? <Pin size={15} /> : <EyeOff size={15} />}</button><button title="Remove widget" onClick={() => remove(widget.id)}><Trash2 size={15} /></button></article>{widget.kind === "notes" && <NoteEditor value={widget.note || ""} onSave={(note) => update(widget.id, { note })} />}</div>;
				})}</div>}
				{available.length > 0 && <><div className="widget-manager-section-title widget-manager-add-title">Add a widget</div><div className="widget-manager-library">{available.map(({ kind, title, description, Icon }) => <button className="widget-library-card" key={kind} onClick={() => add(kind)}><span><Icon size={16} /></span><strong>{title}</strong><small>{description}</small><Plus size={14} className="widget-library-plus" /></button>)}</div></>}
			</div>
			<footer className="widget-manager-footer">Widgets can be hidden, removed, or moved whenever you like.</footer>
		</motion.section>
	);
}
