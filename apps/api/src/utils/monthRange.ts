export const monthRange = (month?: string): { start: Date; next: Date; label: string } => {
    let year: number;
    let monthIndex: number;

    if (month) {
        const [y, m] = month.split("-").map(Number);
        year = y;
        monthIndex = m - 1;
    }
    else {
        const now = new Date();
        year = now.getUTCFullYear();
        monthIndex = now.getUTCMonth();
    }

    const start = new Date(Date.UTC(year, monthIndex, 1));
    const next = new Date(Date.UTC(year, monthIndex + 1, 1));
    const label = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

    return { start, next, label };
}
