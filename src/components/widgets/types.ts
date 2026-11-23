export type DesktopWidgetKind = "clock" | "calendar" | "weather" | "system" | "notes" | "battery";

export interface DesktopWidget {
	id: string;
	kind: DesktopWidgetKind;
	x: number;
	y: number;
	pinned: boolean;
	note?: string;
}

export function parseDesktopWidgets(value: unknown): DesktopWidget[] {
	try {
		const parsed = typeof value === "string" ? JSON.parse(value) : value;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((item): item is DesktopWidget =>
			item && typeof item.id === "string" &&
			["clock", "calendar", "weather", "system", "notes", "battery"].includes(item.kind) &&
			Number.isFinite(Number(item.x)) && Number.isFinite(Number(item.y))
		).map((item) => ({ ...item, x: Math.max(0, Math.min(96, Number(item.x))), y: Math.max(0, Math.min(94, Number(item.y))), pinned: item.pinned !== false }));
	} catch {
		return [];
	}
}
