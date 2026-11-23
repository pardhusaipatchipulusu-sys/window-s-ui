import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Bell, Check, Circle, Clock3, Plus, Trash2, X } from "lucide-react";
import "./TasksView.css";

type Task = { id: string; title: string; dueAt: string; done: boolean; reminded: boolean };
const STORAGE_KEY = "orbix-individual-tasks";

function readTasks(): Task[] {
	try {
		const data: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
		return Array.isArray(data) ? data.filter((item): item is Task => item && typeof item.id === "string" && typeof item.title === "string") : [];
	} catch { return []; }
}

export function TasksView({ onClose }: { onClose?: () => void }) {
	const [tasks, setTasks] = useState<Task[]>(readTasks);
	const [title, setTitle] = useState("");
	const [dueAt, setDueAt] = useState("");
	const [now, setNow] = useState(Date.now());
	const pending = useMemo(() => tasks.filter((task) => !task.done).sort((a, b) => (a.dueAt || "9999").localeCompare(b.dueAt || "9999")), [tasks]);
	const completed = tasks.filter((task) => task.done).length;

	useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }, [tasks]);
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 15000);
		return () => window.clearInterval(timer);
	}, []);
	const addTask = async (event: FormEvent) => {
		event.preventDefault();
		const cleanTitle = title.trim();
		if (!cleanTitle) return;
		if (dueAt && "Notification" in window && Notification.permission === "default") {
			try { await Notification.requestPermission(); } catch { /* In-app reminder still works. */ }
		}
		setTasks((current) => [{ id: crypto.randomUUID(), title: cleanTitle, dueAt, done: false, reminded: false }, ...current]);
		setTitle(""); setDueAt("");
	};

	const formatDue = (value: string) => {
		if (!value) return "No reminder set";
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return "Invalid date";
		return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
	};

	return <section className="tasks-panel" aria-label="Tasks and reminders">
		<header className="tasks-header">
			<div><span className="tasks-eyebrow">YOUR SPACE</span><h2>Tasks & reminders</h2></div>
			<button className="tasks-icon-button" onClick={onClose} aria-label="Close tasks"><X size={16} /></button>
		</header>
		<form className="tasks-form" onSubmit={addTask}>
			<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What do you need to do?" aria-label="Task name" maxLength={120} />
			<div className="tasks-form-bottom">
				<label className="tasks-due"><Clock3 size={14} /><input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} aria-label="Reminder date and time" /></label>
				<button className="tasks-add" type="submit" disabled={!title.trim()}><Plus size={15} /> Add task</button>
			</div>
		</form>
		<div className="tasks-list">
			{pending.length === 0 ? <div className="tasks-empty"><Check size={18} /><span>Nothing pending. Add a task above.</span></div> : pending.map((task) => <article className="task-row" key={task.id}>
				<button className="task-check" aria-label={`Complete ${task.title}`} onClick={() => setTasks((current) => current.map((item) => item.id === task.id ? { ...item, done: true } : item))}><Circle size={18} /></button>
				<div className="task-copy"><strong>{task.title}</strong><span className={task.dueAt && new Date(task.dueAt).getTime() <= now ? "task-due overdue" : "task-due"}>{task.dueAt ? <Bell size={12} /> : <Clock3 size={12} />}{formatDue(task.dueAt)}</span></div>
				<button className="task-delete" aria-label={`Delete ${task.title}`} onClick={() => setTasks((current) => current.filter((item) => item.id !== task.id))}><Trash2 size={14} /></button>
			</article>)}
		</div>
		<footer className="tasks-footer"><span>{pending.length} open</span><span>{completed} completed</span>{completed > 0 && <button onClick={() => setTasks((current) => current.filter((task) => !task.done))}>Clear done</button>}</footer>
	</section>;
}
