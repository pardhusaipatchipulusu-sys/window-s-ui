import React from "react";
import {
	Moon,
	Plane,
	Radio,
	BatteryCharging,
	Scissors,
	Lock,
	SunMedium,
	Bell,
	AppWindow,
	Coffee,
	NotebookPen,
	Calculator,
	MonitorDown,
} from "lucide-react";

interface QuickActionGridProps {
	airplaneMode: boolean;
	onToggleAirplane: () => void;
	onAirplaneContextMenu?: (e: React.MouseEvent) => void;
	showAirplane?: boolean;

	hotspotActive: boolean;
	onToggleHotspot: () => void;
	onHotspotContextMenu?: (e: React.MouseEvent) => void;
	showHotspot?: boolean;

	dndActive: boolean;
	onToggleDnd: () => void;
	onDndContextMenu?: (e: React.MouseEvent) => void;
	showDnd?: boolean;

	batterySaverActive: boolean;
	onToggleBatterySaver: () => void;
	onBatterySaverContextMenu?: (e?: React.MouseEvent) => void;
	showSavings?: boolean;

	onTriggerScreenSnip: () => void;
	onLockWorkstation: () => void;
	onOpenNotificationCenter: () => void;
	onOpenNightLightSettings: () => void;
	onOpenSystemTray?: (e: React.MouseEvent) => void;
	coffeeActive: boolean;
	onToggleCoffee: () => void;
	onOpenNotes: () => void;
	onOpenCalculator: () => void;
	onCaptureScreen: () => void;
	captureSavedPath: string | null;
}

export const QuickActionGrid: React.FC<QuickActionGridProps> = React.memo(({
	airplaneMode,
	onToggleAirplane,
	onAirplaneContextMenu,
	showAirplane = true,

	hotspotActive,
	onToggleHotspot,
	onHotspotContextMenu,
	showHotspot = true,

	dndActive,
	onToggleDnd,
	onDndContextMenu,
	showDnd = true,

	batterySaverActive,
	onToggleBatterySaver,
	onBatterySaverContextMenu,
	showSavings = true,

	onTriggerScreenSnip,
	onLockWorkstation,
	onOpenNotificationCenter,
	onOpenNightLightSettings,
	onOpenSystemTray,
	coffeeActive,
	onToggleCoffee,
	onOpenNotes,
	onOpenCalculator,
	onCaptureScreen,
	captureSavedPath,
}) => {
	return (
		<div className="cc-actions-grid">
			{/* Night Light */}
			<button
				type="button"
				className="cc-action-tile"
				onClick={(e) => {
					e.stopPropagation();
					onOpenNightLightSettings();
				}}
				title="Night Light • Click for Display Settings"
			>
				<SunMedium size={14} />
				<span className="cc-action-name">Night light</span>
			</button>

			{/* Airplane Mode */}
			{showAirplane && (
				<button
					type="button"
					className={`cc-action-tile ${airplaneMode ? "active" : ""}`}
					onClick={(e) => {
						e.stopPropagation();
						onToggleAirplane();
					}}
					onContextMenu={onAirplaneContextMenu}
					title={`Airplane Mode: ${airplaneMode ? "On" : "Off"} • Click to Toggle`}
				>
					<Plane size={14} />
					<span className="cc-action-name">Airplane</span>
				</button>
			)}

			{/* Mobile Hotspot */}
			{showHotspot && (
				<button
					type="button"
					className={`cc-action-tile ${hotspotActive ? "active" : ""}`}
					onClick={(e) => {
						e.stopPropagation();
						onToggleHotspot();
					}}
					onContextMenu={onHotspotContextMenu}
					title={`Mobile Hotspot: ${hotspotActive ? "On" : "Off"} • Click to Toggle`}
				>
					<Radio size={14} />
					<span className="cc-action-name">Hotspot</span>
				</button>
			)}

			{/* Focus / DND */}
			{showDnd && (
				<button
					type="button"
					className={`cc-action-tile ${dndActive ? "active" : ""}`}
					onClick={(e) => {
						e.stopPropagation();
						onToggleDnd();
					}}
					onContextMenu={onDndContextMenu}
					title={`Focus / DND: ${dndActive ? "On" : "Off"} • Click to Toggle`}
				>
					<Moon size={14} />
					<span className="cc-action-name">Focus</span>
				</button>
			)}

			{/* Energy Saver */}
			{showSavings && (
				<button
					type="button"
					className={`cc-action-tile ${batterySaverActive ? "active" : ""}`}
					onClick={(e) => {
						e.stopPropagation();
						onToggleBatterySaver();
					}}
					onContextMenu={onBatterySaverContextMenu}
					title={`Energy Saver: ${batterySaverActive ? "On" : "Off"} • Click to Toggle`}
				>
					<BatteryCharging size={14} />
					<span className="cc-action-name">Saver</span>
				</button>
			)}

			{/* Screen Snip */}
			<button
				type="button"
				className="cc-action-tile"
				onClick={(e) => {
					e.stopPropagation();
					onTriggerScreenSnip();
				}}
				title="Screen Snip (Win+Shift+S)"
			>
				<Scissors size={14} />
				<span className="cc-action-name">Snip</span>
			</button>

			{/* Full-screen capture */}
			<button
				type="button"
				className={`cc-action-tile ${captureSavedPath ? "active" : ""}`}
				onClick={(e) => {
					e.stopPropagation();
					onCaptureScreen();
				}}
				title={captureSavedPath || "Capture all monitors to Pictures\\Screenshots"}
			>
				<MonitorDown size={14} />
				<span className="cc-action-name">{captureSavedPath ? "Saved" : "Capture"}</span>
			</button>

			{/* Keep the PC awake */}
			<button
				type="button"
				className={`cc-action-tile ${coffeeActive ? "active" : ""}`}
				onClick={(e) => {
					e.stopPropagation();
					onToggleCoffee();
				}}
				title={`Keep awake: ${coffeeActive ? "On" : "Off"}`}
			>
				<Coffee size={14} />
				<span className="cc-action-name">Coffee</span>
			</button>

			{/* Notes */}
			<button
				type="button"
				className="cc-action-tile"
				onClick={(e) => {
					e.stopPropagation();
					onOpenNotes();
				}}
				title="Open private notes"
			>
				<NotebookPen size={14} />
				<span className="cc-action-name">Notes</span>
			</button>

			{/* Windows Calculator */}
			<button
				type="button"
				className="cc-action-tile"
				onClick={(e) => {
					e.stopPropagation();
					onOpenCalculator();
				}}
				title="Open Calculator"
			>
				<Calculator size={14} />
				<span className="cc-action-name">Calculator</span>
			</button>

			{/* Lock Workstation */}
			<button
				type="button"
				className="cc-action-tile"
				onClick={(e) => {
					e.stopPropagation();
					onLockWorkstation();
				}}
				title="Lock PC"
			>
				<Lock size={14} />
				<span className="cc-action-name">Lock</span>
			</button>

			{/* System Tray or Notification Center */}
			{onOpenSystemTray ? (
				<button
					type="button"
					className="cc-action-tile"
					onClick={(e) => {
						e.stopPropagation();
						onOpenSystemTray(e);
					}}
					title="System Tray Icons"
				>
					<AppWindow size={14} />
					<span className="cc-action-name">Tray</span>
				</button>
			) : (
				<button
					type="button"
					className="cc-action-tile"
					onClick={(e) => {
						e.stopPropagation();
						onOpenNotificationCenter();
					}}
					title="Notifications"
				>
					<Bell size={14} />
					<span className="cc-action-name">Alerts</span>
				</button>
			)}
		</div>
	);
});
