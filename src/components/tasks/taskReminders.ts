const STORAGE_KEY = "orbix-individual-tasks";

type ReminderTask = { id: string; title: string; dueAt: string; done: boolean; reminded: boolean };

function readTasks(): ReminderTask[] {
	try {
		const data: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
		return Array.isArray(data) ? data.filter((item): item is ReminderTask => item && typeof item.id === "string" && typeof item.title === "string") : [];
	} catch { return []; }
}

// Keep task alarms active while Orbix is open, without loading the full Tasks panel.
if (typeof window !== "undefined") {
	window.setInterval(() => {
		const tasks = readTasks();
		const due = tasks.filter((task) => !task.done && !task.reminded && task.dueAt && new Date(task.dueAt).getTime() <= Date.now());
		if (!due.length) return;
		const dueIds = new Set(due.map((task) => task.id));
		localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks.map((task) => dueIds.has(task.id) ? { ...task, reminded: true } : task)));
		for (const task of due) {
			window.dispatchEvent(new CustomEvent("orbix-task-reminder", { detail: { id: task.id, title: task.title } }));
			if ("Notification" in window && Notification.permission === "granted") new Notification("Task reminder", { body: task.title });
		}
	}, 15_000);
}
