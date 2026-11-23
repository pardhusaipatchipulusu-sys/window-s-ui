import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Calendar, Grip, Pin } from "lucide-react";
import type { DesktopWidget } from "./types";
import "./DesktopWidgetsLayer.css";

type DesktopWidgetsLayerProps = {
	widgets: DesktopWidget[];
	arranging: boolean;
	onChange: (widgets: DesktopWidget[]) => void;
};

function useSystemMetrics() {
	const [metrics, setMetrics] = useState({ cpu: 0, memory: 0 });
	useEffect(() => {
		let active = true;
		const refresh = async () => {
			try {
				const [cpu, memory] = await Promise.all([invoke<number>("get_cpu_usage"), invoke<number>("get_ram_usage")]);
				if (active) setMetrics({ cpu, memory });
			} catch { /* Keep the last reading if a system query is unavailable. */ }
		};
		void refresh();
		const timer = window.setInterval(() => void refresh(), 3 * 60 * 1000);
		return () => { active = false; window.clearInterval(timer); };
	}, []);
	return metrics;
}

function useBatteryLevel() {
	const [battery, setBattery] = useState<{ level: number; charging: boolean } | null>(null);
	useEffect(() => {
		let active = true;
		let manager: any;
		const refresh = async () => {
			try {
				manager ??= await (navigator as any).getBattery?.();
				if (active && manager) setBattery({ level: Math.round(manager.level * 100), charging: Boolean(manager.charging) });
			} catch { /* Battery information is not available on every Windows device. */ }
		};
		void refresh();
		const timer = window.setInterval(() => void refresh(), 3 * 60 * 1000);
		return () => { active = false; window.clearInterval(timer); };
	}, []);
	return battery;
}

function SystemWidget() {
	const metrics = useSystemMetrics();
	return <div className="desk-system"><div><small>CPU</small><strong>{metrics.cpu}%</strong><i><b style={{ width: `${Math.max(2, Math.min(100, metrics.cpu))}%` }} /></i></div><div><small>MEMORY</small><strong>{metrics.memory}%</strong><i><b style={{ width: `${Math.max(2, Math.min(100, metrics.memory))}%` }} /></i></div><footer>Refreshes every 3 minutes</footer></div>;
}

function BatteryWidget() {
	const battery = useBatteryLevel();
	return <div className="desk-battery"><span>🔋</span><div><strong>{battery ? `${battery.level}%` : "Battery"}</strong><small>{battery ? (battery.charging ? "Charging" : "On battery") : "Not available on this device"}</small></div></div>;
}

function ClockWidget() {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		let timer: number;
		const update = () => {
			const current = new Date();
			setNow(current);
			timer = window.setTimeout(update, 60_000 - (current.getSeconds() * 1000 + current.getMilliseconds()));
		};
		update();
		return () => window.clearTimeout(timer);
	}, []);
	return <div className="desk-clock"><div className="desk-weekday">{now.toLocaleDateString([], { weekday: "long" }).toUpperCase()}</div><div className="desk-date">{now.toLocaleDateString([], { day: "2-digit", month: "long", year: "numeric" }).toUpperCase()}</div><div className="desk-time">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })}</div></div>;
}

function CalendarWidget() {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const timer = window.setInterval(() => setNow(new Date()), 3 * 60 * 1000);
		return () => window.clearInterval(timer);
	}, []);
	const first = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
	const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
	return <div className="desk-calendar"><div className="desk-calendar-heading"><Calendar size={15} />{now.toLocaleDateString([], { month: "long", year: "numeric" })}</div><div className="desk-calendar-grid">{["S", "M", "T", "W", "T", "F", "S"].map((day, i) => <span className="desk-calendar-weekday" key={`${day}-${i}`}>{day}</span>)}{Array.from({ length: first }, (_, i) => <span key={`empty-${i}`} />)}{Array.from({ length: days }, (_, i) => <span className={i + 1 === now.getDate() ? "today" : ""} key={i + 1}>{i + 1}</span>)}</div></div>;
}

type WeatherSummary = { temp: string; condition: string };

function WidgetBody({ widget, weather }: { widget: DesktopWidget; weather: WeatherSummary }) {
	if (widget.kind === "clock") return <ClockWidget />;
	if (widget.kind === "calendar") {
		return <CalendarWidget />;
	}
	if (widget.kind === "weather") return <div className="desk-weather"><span>🌤️</span><div><strong>{weather.temp ? `${weather.temp}°` : "Weather"}</strong><small>{weather.condition || "Set a location in the notch"}</small></div></div>;
	if (widget.kind === "system") return <SystemWidget />;
	if (widget.kind === "battery") return <BatteryWidget />;
	return <div className="desk-note">{widget.note || "Write a quick note…"}</div>;
}

export function DesktopWidgetsLayer({ widgets, arranging, onChange }: DesktopWidgetsLayerProps) {
	const [preview, setPreview] = useState(widgets);
	const previewRef = useRef(preview);
	previewRef.current = preview;
	const [weather, setWeather] = useState<WeatherSummary>(() => ({ temp: localStorage.getItem("bloom-weather-cached-temp") || "", condition: localStorage.getItem("bloom-weather-cached-condition") || "" }));
	const dragging = useRef<{ id: string; pointerId: number; x: number; y: number; startX: number; startY: number } | null>(null);
	const displayed = useMemo(() => preview.filter((widget) => widget.pinned), [preview]);

	useEffect(() => { if (!dragging.current) { previewRef.current = widgets; setPreview(widgets); } }, [widgets]);
	const refreshWeather = useCallback(async () => {
		const settings: Record<string, unknown> = await invoke<Record<string, unknown>>("load_settings").catch(() => ({} as Record<string, unknown>));
		setWeather({ temp: String(settings["bloom-weather-cached-temp"] ?? localStorage.getItem("bloom-weather-cached-temp") ?? ""), condition: String(settings["bloom-weather-cached-condition"] ?? localStorage.getItem("bloom-weather-cached-condition") ?? "") });
	}, []);
	useEffect(() => {
		if (!widgets.some((widget) => widget.kind === "weather")) return;
		void refreshWeather();
		const unlisten = listen<{ key: string }>("settings-changed", (event) => {
			if (event.payload.key === "bloom-weather-cached-temp" || event.payload.key === "bloom-weather-cached-condition") void refreshWeather();
		});
		return () => { unlisten.then((stop) => stop()); };
	}, [refreshWeather, widgets]);

	const updateNativeRects = useCallback(async () => {
		try {
			const window = getCurrentWebviewWindow();
			const [position, scale] = await Promise.all([window.outerPosition(), window.scaleFactor()]);
			const rects = Array.from(document.querySelectorAll<HTMLElement>("[data-desktop-widget='true']")).map((element) => {
				const rect = element.getBoundingClientRect();
				return { x: Math.round(position.x + rect.left * scale), y: Math.round(position.y + rect.top * scale), width: Math.round(rect.width * scale), height: Math.round(rect.height * scale) };
			});
			await invoke("set_desktop_widget_rects", { rects });
		} catch { /* The overlay may be closing during shutdown. */ }
	}, []);

	useLayoutEffect(() => {
		let frame = requestAnimationFrame(() => void updateNativeRects());
		const resize = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => void updateNativeRects()); };
		window.addEventListener("resize", resize);
		return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); };
	}, [displayed, arranging, updateNativeRects]);

	const onPointerDown = (event: PointerEvent<HTMLDivElement>, widget: DesktopWidget) => {
		if (!arranging) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		dragging.current = { id: widget.id, pointerId: event.pointerId, x: widget.x, y: widget.y, startX: event.clientX, startY: event.clientY };
		void invoke("set_desktop_widget_dragging", { dragging: true });
	};
	const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
		const drag = dragging.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		const item = preview.find((widget) => widget.id === drag.id);
		if (!item) return;
		const rect = event.currentTarget.getBoundingClientRect();
		const widgetRect = event.currentTarget.querySelector<HTMLElement>(`[data-widget-id="${drag.id}"]`)?.getBoundingClientRect();
		const maxX = Math.max(0, 100 - (widgetRect?.width ?? 240) / rect.width * 100);
		const maxY = Math.max(0, 100 - (widgetRect?.height ?? 160) / rect.height * 100);
		const x = Math.max(0, Math.min(maxX, drag.x + (event.clientX - drag.startX) / rect.width * 100));
		const y = Math.max(0, Math.min(maxY, drag.y + (event.clientY - drag.startY) / rect.height * 100));
		const next = previewRef.current.map((entry) => entry.id === drag.id ? { ...entry, x, y } : entry);
		previewRef.current = next;
		setPreview(next);
	};
	const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
		const drag = dragging.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		const stage = event.currentTarget.getBoundingClientRect();
		const widgetRect = event.currentTarget.querySelector<HTMLElement>(`[data-widget-id="${drag.id}"]`)?.getBoundingClientRect();
		const maxX = Math.max(0, 100 - (widgetRect?.width ?? 240) / stage.width * 100);
		const maxY = Math.max(0, 100 - (widgetRect?.height ?? 160) / stage.height * 100);
		const finalX = Math.max(0, Math.min(maxX, drag.x + (event.clientX - drag.startX) / stage.width * 100));
		const finalY = Math.max(0, Math.min(maxY, drag.y + (event.clientY - drag.startY) / stage.height * 100));
		const next = previewRef.current.map((widget) => widget.id === drag.id ? { ...widget, x: finalX, y: finalY } : widget);
		dragging.current = null;
		previewRef.current = next;
		setPreview(next);
		onChange(next);
		void (async () => {
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			await updateNativeRects();
			await invoke("set_desktop_widget_dragging", { dragging: false });
		})();
	};

	return <div className={`desktop-widget-stage ${arranging ? "arranging" : ""}`} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
		{displayed.map((widget) => <div className={`desktop-widget-card desktop-widget-${widget.kind}`} data-desktop-widget="true" data-widget-id={widget.id} key={widget.id} style={{ left: `${widget.x}%`, top: `${widget.y}%` }} onPointerDown={(event) => onPointerDown(event, widget)}>
			{arranging && <div className="desktop-widget-drag-bar"><Grip size={13} /><span>Move widget</span><Pin size={11} /></div>}
			<WidgetBody widget={widget} weather={weather} />
		</div>)}
	</div>;
}
