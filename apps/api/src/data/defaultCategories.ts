type DefaultCategory = {
    name: string;
    kind: "expense" | "income",
    icon: string,
    color: string
}

export const defaultCategories: DefaultCategory[] = [
    { name: "Food & Dining", kind: "expense", icon: "food", color: "success" },
    { name: "Shopping", kind: "expense", icon: "shopping", color: "danger" },
    { name: "Transportation", kind: "expense", icon: "transport", color: "info" },
    { name: "Bills & Utilities", kind: "expense", icon: "bills", color: "accent" },
    { name: "Entertainment", kind: "expense", icon: "entertainment", color: "warning" },
    { name: "Healthcare", kind: "expense", icon: "health", color: "success" },
    { name: "Income", kind: "income", icon: "income", color: "success" },
    { name: "Others", kind: "expense", icon: "more", color: "gray500" },
];