import React, { useEffect, useState } from "react";
import { ChevronLeft, Bluetooth, ExternalLink } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface BluetoothBatteryInfo {
	device_name: string;
	battery_level: number;
}

interface BluetoothSubViewProps {
	bluetoothEnabled: boolean;
	onToggleBluetooth: () => void;
	onBack: () => void;
	onOpenSettings: () => void;
}

export const BluetoothSubView: React.FC<BluetoothSubViewProps> = ({
	bluetoothEnabled,
	onToggleBluetooth,
	onBack,
	onOpenSettings,
}) => {
	const [devices, setDevices] = useState<BluetoothBatteryInfo[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let active = true;
		const refresh = async () => {
			try {
				const result = await invoke<BluetoothBatteryInfo[]>("get_bluetooth_battery_levels");
				if (active) setDevices(result);
			} catch {
				if (active) setDevices([]);
			} finally {
				if (active) setLoading(false);
			}
		};
		void refresh();
		const interval = window.setInterval(() => void refresh(), 180_000);
		return () => {
			active = false;
			window.clearInterval(interval);
		};
	}, []);

	return (
		<div className="cc-subview-container">
			<div className="cc-subview-header">
				<button
					type="button"
					className="cc-subview-back-btn"
					onClick={(e) => {
						e.stopPropagation();
						onBack();
					}}
					title="Back"
				>
					<ChevronLeft size={16} />
				</button>
				<span className="cc-subview-title">Bluetooth</span>
				<div className="cc-subview-header-actions">
					<button
						type="button"
						className={`cc-subview-toggle-pill ${bluetoothEnabled ? "active" : ""}`}
						onClick={(e) => {
							e.stopPropagation();
							onToggleBluetooth();
						}}
						title={bluetoothEnabled ? "Turn Bluetooth Off" : "Turn Bluetooth On"}
					>
						{bluetoothEnabled ? "On" : "Off"}
					</button>
				</div>
			</div>

			<div className="cc-subview-body">
				<div className="cc-subview-bt-card">
					<div className="cc-subview-bt-icon-row">
						<div className={`cc-subview-bt-icon-box ${bluetoothEnabled ? "active" : ""}`}>
							<Bluetooth size={20} />
						</div>
						<div>
							<h4 className="cc-subview-bt-title">
								{bluetoothEnabled ? "Bluetooth is On" : "Bluetooth is Off"}
							</h4>
							<p className="cc-subview-bt-subtitle">
								{bluetoothEnabled
									? "Your PC is discoverable by nearby devices"
									: "Turn on Bluetooth to connect wireless devices"}
							</p>
						</div>
					</div>

					<button
						type="button"
						className="cc-subview-settings-link"
						onClick={(e) => {
							e.stopPropagation();
							onOpenSettings();
						}}
					>
						<span>Manage Bluetooth in Windows Settings</span>
						<ExternalLink size={13} />
					</button>
				</div>

				<div className="cc-bt-battery-list">
					<div className="cc-bt-battery-heading">Device battery</div>
					{loading ? (
						<div className="cc-bt-battery-empty">Checking connected devices…</div>
					) : devices.length > 0 ? (
						devices.map((device, index) => (
							<div className="cc-bt-battery-row" key={`${device.device_name}-${index}`}>
								<span className="cc-bt-battery-name" title={device.device_name}>
									{device.device_name || "Bluetooth device"}
								</span>
								<span className="cc-bt-battery-level">{device.battery_level}%</span>
							</div>
						))
					) : (
						<div className="cc-bt-battery-empty">
							No connected device is reporting its battery level.
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
