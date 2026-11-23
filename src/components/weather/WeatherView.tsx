import { useCallback, useEffect, useMemo, useState } from "react";
import { X, Wind, Droplets, Sunrise, Sunset, Umbrella, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import "./WeatherView.css";

type Coordinates = { lat: number; lon: number };
type Forecast = {
	current: { time: string; temperature_2m: number; relative_humidity_2m: number; apparent_temperature: number; is_day: number; precipitation: number; weather_code: number; wind_speed_10m: number };
	hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[] };
	daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; sunrise: string[]; sunset: string[]; uv_index_max: number[]; precipitation_probability_max: number[] };
};
type AirQuality = { current: { us_aqi: number; european_aqi: number; pm2_5: number; pm10: number } };

const conditionInfo = (code: number, day = true) => {
	if (code === 0) return { label: day ? "Clear skies" : "Clear night", icon: day ? "☀️" : "🌙", scene: day ? "clear" : "night" };
	if (code === 1 || code === 2) return { label: "Partly cloudy", icon: day ? "🌤️" : "☁️", scene: "cloud" };
	if (code === 3) return { label: "Overcast", icon: "☁️", scene: "cloud" };
	if (code === 45 || code === 48) return { label: "Foggy", icon: "🌫️", scene: "fog" };
	if (code >= 51 && code <= 57) return { label: "Drizzle", icon: "🌦️", scene: "rain" };
	if (code >= 61 && code <= 67) return { label: "Rain", icon: "🌧️", scene: "rain" };
	if (code >= 71 && code <= 77) return { label: "Snow", icon: "🌨️", scene: "snow" };
	if (code >= 80 && code <= 82) return { label: "Rain showers", icon: "🌦️", scene: "rain" };
	if (code >= 85 && code <= 86) return { label: "Snow showers", icon: "🌨️", scene: "snow" };
	if (code >= 95) return { label: "Thunderstorms", icon: "⛈️", scene: "storm" };
	return { label: "Current conditions", icon: "🌤️", scene: "cloud" };
};

const aqiInfo = (value: number) => {
	if (value <= 50) return { label: "Good", tone: "good" };
	if (value <= 100) return { label: "Moderate", tone: "moderate" };
	if (value <= 150) return { label: "Sensitive groups", tone: "sensitive" };
	if (value <= 200) return { label: "Unhealthy", tone: "unhealthy" };
	if (value <= 300) return { label: "Very unhealthy", tone: "very-unhealthy" };
	return { label: "Hazardous", tone: "hazardous" };
};

const moonInfo = (date = new Date()) => {
	const cycleDays = 29.53058867;
	const phase = (((date.getTime() / 86400000 + 2440587.5 - 2451550.1) % cycleDays) + cycleDays) % cycleDays / cycleDays;
	const illumination = Math.round((1 - Math.cos(phase * Math.PI * 2)) * 50);
	const index = Math.round(phase * 8) % 8;
	const names = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];
	const icons = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
	return { label: names[index], icon: icons[index], illumination };
};

function localTime(value?: string) {
	if (!value) return "—";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? value.slice(-5) : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function WeatherView({ coordinates, cityName, tempUnit, onClose }: { coordinates: Coordinates | null; cityName: string; tempUnit: string; onClose: () => void }) {
	const [forecast, setForecast] = useState<Forecast | null>(null);
	const [air, setAir] = useState<AirQuality | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [selectedHour, setSelectedHour] = useState<number | null>(null);
	const unit = tempUnit === "fahrenheit" ? "°F" : "°C";

	const refresh = useCallback(async () => {
		if (!coordinates) return;
		setLoading(true); setError(""); setAir(null);
		const { lat, lon } = coordinates;
		const unitParam = tempUnit === "fahrenheit" ? "&temperature_unit=fahrenheit" : "";
		const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max&timezone=auto&forecast_days=7${unitParam}`;
		const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,european_aqi,pm2_5,pm10&timezone=auto`;
		try {
			const [forecastResponse, airResponse] = await Promise.all([fetch(forecastUrl), fetch(airUrl)]);
			if (!forecastResponse.ok) throw new Error(`Forecast unavailable (${forecastResponse.status})`);
			setForecast(await forecastResponse.json() as Forecast);
			if (airResponse.ok) {
				const result = await airResponse.json() as AirQuality;
				if (Number.isFinite(result?.current?.us_aqi) && Number.isFinite(result?.current?.pm2_5) && Number.isFinite(result?.current?.pm10)) setAir(result);
			}
		} catch (e) { setError(String(e)); }
		finally { setLoading(false); }
	}, [coordinates, tempUnit]);

	useEffect(() => {
		void refresh();
		const interval = window.setInterval(() => void refresh(), 30 * 60 * 1000);
		return () => window.clearInterval(interval);
	}, [refresh]);

	const chartHours = useMemo(() => {
		if (!forecast) return [];
		const start = Math.max(0, forecast.hourly.time.findIndex((t) => t.slice(0, 13) >= forecast.current.time.slice(0, 13)));
		return forecast.hourly.time.slice(start, start + 24).map((time, i) => ({
			time,
			temp: forecast.hourly.temperature_2m[start + i],
			precip: forecast.hourly.precipitation_probability[start + i] ?? 0,
			code: forecast.hourly.weather_code[start + i]
		}));
	}, [forecast]);

	const chartPoints = useMemo(() => {
		if (chartHours.length === 0) return [];
		const values = chartHours.map((hour) => hour.temp);
		const min = Math.min(...values) - 2;
		const max = Math.max(...values) + 2;
		return chartHours.map((hour, index) => ({
			...hour,
			x: 16 + index * (548 / Math.max(1, chartHours.length - 1)),
			y: 100 - ((hour.temp - min) / Math.max(1, max - min)) * 70
		}));
	}, [chartHours]);

	const current = forecast?.current;
	const scene = current ? conditionInfo(current.weather_code, current.is_day === 1) : conditionInfo(0);
	const moon = moonInfo();
	const airState = air ? aqiInfo(air.current.us_aqi) : null;
	const selected = selectedHour === null ? null : chartPoints[selectedHour];

	return (
		<motion.section className="weather-panel" initial={{ opacity: 0, y: -7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -7 }}>
			<header className="weather-panel-header"><div><strong>Weather</strong><span>{cityName || "Your location"}</span></div><div className="weather-header-actions"><button type="button" title="Refresh weather" onClick={() => void refresh()} disabled={loading}><RefreshCw size={14} className={loading ? "weather-refresh-spin" : ""} /></button><button type="button" title="Close" onClick={onClose}><X size={17} /></button></div></header>
			{!coordinates && <div className="weather-message">Setting up your location…</div>}
			{error && <div className="weather-message weather-error">{error}</div>}
			{forecast && current && <div className={`weather-sky weather-sky-${scene.scene}`}>
				<div className="sky-glow" />
				<div className="sky-stars"><i /><i /><i /><i /><i /></div>
				<div className="sky-cloud sky-cloud-one"><i /><i /><i /></div><div className="sky-cloud sky-cloud-two"><i /><i /><i /></div>
				<div className="sky-sun-path"><span /></div>
				<div className="weather-current"><div className="weather-hero-icon">{scene.icon}</div><div><div className="weather-temperature">{Math.round(current.temperature_2m)}<sup>{unit}</sup></div><div className="weather-condition">{scene.label}</div><div className="weather-feels">Feels like {Math.round(current.apparent_temperature)}{unit} · {cityName || "Local forecast"}</div></div></div>
				<div className="weather-sky-details"><span><Sunrise size={13} /> {localTime(forecast.daily.sunrise[0])}</span><span><Sunset size={13} /> {localTime(forecast.daily.sunset[0])}</span><span className="moon-detail">{moon.icon} {moon.label} · {moon.illumination}%</span></div>
			</div>}
			{forecast && current && <div className="weather-stats">
				<div><Wind size={15} /><small>Wind</small><strong>{Math.round(current.wind_speed_10m)} <em>km/h</em></strong></div>
				<div><Droplets size={15} /><small>Humidity</small><strong>{current.relative_humidity_2m}<em>%</em></strong></div>
				<div><Umbrella size={15} /><small>Rain chance</small><strong>{forecast.daily.precipitation_probability_max[0] ?? 0}<em>%</em></strong></div>
				<div className={`weather-aqi ${airState?.tone ?? "pending"}`}><span className="aqi-dot" /><small>Air quality</small><strong>{air ? `${air.current.us_aqi} · ${airState?.label}` : "Loading…"}</strong><em>{air ? `PM2.5 ${air.current.pm2_5.toFixed(1)} · PM10 ${air.current.pm10.toFixed(1)} µg/m³` : "No key needed"}</em></div>
			</div>}
			{chartPoints.length > 0 && <section className="weather-chart-section"><div className="weather-section-title"><strong>Next 24 hours</strong><span>{selected ? `${localTime(selected.time)} · ${Math.round(selected.temp)}${unit} · ${selected.precip}% rain` : "Select a point"}</span></div><svg className="weather-chart" viewBox="0 0 580 126" role="img" aria-label="Interactive 24 hour temperature and rain forecast chart"><defs><linearGradient id="weatherFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".24" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs><path d={`M ${chartPoints[0].x} 115 ${chartPoints.map((p) => `L ${p.x} ${p.y}`).join(" ")} L ${chartPoints[chartPoints.length - 1].x} 115 Z`} fill="url(#weatherFill)" /><polyline points={chartPoints.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />{chartPoints.map((point, index) => <g key={point.time} onClick={() => setSelectedHour(index)} className="weather-chart-point" role="button" tabIndex={0} aria-label={`${localTime(point.time)} ${Math.round(point.temp)} degrees`} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedHour(index); }}><circle cx={point.x} cy={point.y} r={selectedHour === index ? 5 : 2.5} /><text x={point.x} y="120" textAnchor="middle">{index % 4 === 0 ? localTime(point.time) : ""}</text></g>)}</svg></section>}
			{forecast && <section className="weather-week"><div className="weather-section-title"><strong>7-day outlook</strong><span>UV today {Math.round(forecast.daily.uv_index_max[0])}</span></div><div className="weather-days">{forecast.daily.time.slice(0, 7).map((day, index) => { const condition = conditionInfo(forecast.daily.weather_code[index], true); const date = new Date(`${day}T12:00:00`); return <div className="weather-day" key={day}><strong>{index === 0 ? "Today" : date.toLocaleDateString([], { weekday: "short" })}</strong><span>{condition.icon}</span><small>{forecast.daily.precipitation_probability_max[index] || 0}% rain</small><div className="weather-day-temps"><span>{Math.round(forecast.daily.temperature_2m_max[index])}°</span><i /><span>{Math.round(forecast.daily.temperature_2m_min[index])}°</span></div></div>; })}</div></section>}
			{!current && !error && <div className="weather-message">{loading ? "Loading your forecast…" : "Weather details will appear here."}</div>}
			<footer className="weather-credit">Forecast · Open-Meteo &nbsp; Air quality · CAMS ENSEMBLE</footer>
		</motion.section>
	);
}
