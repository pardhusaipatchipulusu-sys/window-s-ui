import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Download, FolderOpen, Link2, X, CircleCheck, CircleAlert, LoaderCircle, Clock3 } from "lucide-react";
import { motion } from "framer-motion";
import "./DownloaderView.css";

type Job = {
	id: string; url: string; kind: "video" | "audio"; title: string; status: string;
	progress: number; speed: string; eta: string; error: string; createdAt: number;
};

export function DownloaderView({ onClose }: { onClose: () => void }) {
	const [jobs, setJobs] = useState<Job[]>([]);
	const [url, setUrl] = useState("");
	const [kind, setKind] = useState<"video" | "audio">("video");
	const [error, setError] = useState("");
	const [adding, setAdding] = useState(false);

	const refresh = useCallback(async () => {
		try { setJobs(await invoke<Job[]>("get_download_jobs")); } catch (e) { setError(String(e)); }
	}, []);

	useEffect(() => {
		void refresh();
		let unlisten: (() => void) | undefined;
		let cancelled = false;
		listen<Job>("download-update", (event) => {
			const incoming = event.payload;
			setJobs((current) => [incoming, ...current.filter((job) => job.id !== incoming.id)]);
		}).then((fn) => { if (cancelled) fn(); else unlisten = fn; });
		return () => { cancelled = true; unlisten?.(); };
	}, [refresh]);

	const add = async (event: FormEvent) => {
		event.preventDefault();
		if (!url.trim()) return;
		setAdding(true); setError("");
		try { await invoke("queue_download", { url: url.trim(), kind }); setUrl(""); await refresh(); }
		catch (e) { setError(String(e)); }
		finally { setAdding(false); }
	};

	const active = jobs.filter((job) => ["queued", "downloading"].includes(job.status));
	const history = jobs.filter((job) => !["queued", "downloading"].includes(job.status));
	const statusIcon = (status: string) => status === "completed" ? <CircleCheck size={15} /> : status === "failed" ? <CircleAlert size={15} /> : status === "queued" ? <Clock3 size={15} /> : <LoaderCircle className="downloader-spin" size={15} />;

	return (
		<motion.section className="downloader-panel" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
			<header className="downloader-header">
				<div className="downloader-heading"><span className="downloader-icon"><Download size={17} /></span><div><strong>Video & audio</strong><small>Private downloads saved on this PC</small></div></div>
				<div className="downloader-header-actions"><button title="Open download folder" onClick={() => void invoke("open_download_folder").catch((e) => setError(String(e)))}><FolderOpen size={16} /></button><button title="Close" onClick={onClose}><X size={17} /></button></div>
			</header>
			<form className="downloader-form" onSubmit={add}>
				<div className="downloader-url"><Link2 size={16} /><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a video or audio link" aria-label="Video or audio link" /></div>
				<select value={kind} onChange={(e) => setKind(e.target.value as "video" | "audio")} aria-label="Download type"><option value="video">Video · up to 4K</option><option value="audio">Audio · MP3</option></select>
				<button className="downloader-add" disabled={adding || !url.trim()}><Download size={15} />{adding ? "Adding…" : "Add to queue"}</button>
			</form>
			{error && <p className="downloader-error">{error}</p>}
			<div className="downloader-content">
				{active.length > 0 && <section><h3>Queue <span>{active.length}</span></h3>{active.map((job) => <article className="download-job" key={job.id}><div className="download-job-top"><span className="download-job-title">{job.title || job.url}</span><span className="download-job-status">{statusIcon(job.status)}{job.status === "downloading" ? `${Math.round(job.progress)}%` : job.status}</span></div><div className="download-progress"><i style={{ width: `${job.status === "queued" ? 3 : job.progress}%` }} /></div><div className="download-job-meta"><span>{job.kind === "video" ? "Video · up to 4K" : "MP3 audio"}</span><span>{[job.speed, job.eta ? `ETA ${job.eta}` : ""].filter(Boolean).join(" · ")}</span></div></article>)}</section>}
				<section><h3>History <span>{history.length}</span></h3>{history.length === 0 ? <p className="downloader-empty">Downloads will appear here when they finish.</p> : history.slice(0, 8).map((job) => <article className="download-history" key={job.id}><span className={`history-status ${job.status}`}>{statusIcon(job.status)}</span><div className="history-copy"><strong>{job.title || job.url}</strong><small>{job.kind === "video" ? "Video · up to 4K" : "MP3 audio"}{job.error ? ` · ${job.error}` : ""}</small></div><span className="history-result">{job.status}</span></article>)}</section>
			</div>
			<p className="downloader-footnote">Only download content you have permission to save. Downloads stay in your Downloads folder.</p>
		</motion.section>
	);
}
