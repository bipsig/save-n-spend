// What a brand-new user's category tree looks like.
//
// Two levels, because that is what the rest of the app is built to read: spend on a
// child rolls into its parent everywhere a total is shown (see budgetService and the
// insights breakdown), so the parents are the handful of headings someone budgets
// against and the children are the detail they actually file a purchase under.
//
// Seeding the tree is what makes sub-categories findable: nobody discovers them from a flat
// list. Shallow per parent, though — a default set is a starting point someone edits, and
// thirty rows to prune is worse than eight to extend.

type DefaultCategory = {
    name: string;
    kind: "expense" | "income",
    icon: string,
    color: string,
    /** The children filed under it. One level only — a child cannot have its own. */
    children?: { name: string; icon: string; color: string }[]
}

export const defaultCategories: DefaultCategory[] = [
    {
        name: "Food & Dining", kind: "expense", icon: "food", color: "success",
        children: [
            { name: "Groceries", icon: "groceries", color: "success" },
            { name: "Restaurants", icon: "restaurant", color: "warning" },
            { name: "Cafes & Snacks", icon: "cafe", color: "accent" },
        ],
    },
    {
        name: "Transportation", kind: "expense", icon: "transport", color: "info",
        children: [
            { name: "Fuel", icon: "fuel", color: "warning" },
            { name: "Cabs & Autos", icon: "taxi", color: "accent" },
            { name: "Public Transport", icon: "bus", color: "info" },
        ],
    },
    {
        name: "Bills & Utilities", kind: "expense", icon: "bills", color: "accent",
        children: [
            { name: "Rent", icon: "home", color: "danger" },
            { name: "Electricity", icon: "bolt", color: "warning" },
            { name: "Internet & Mobile", icon: "wifi", color: "info" },
            { name: "Subscriptions", icon: "tv", color: "accent" },
        ],
    },
    {
        name: "Shopping", kind: "expense", icon: "shopping", color: "danger",
        children: [
            { name: "Clothing", icon: "clothing", color: "danger" },
            { name: "Electronics", icon: "devices", color: "info" },
            { name: "Household", icon: "cleaning", color: "success" },
        ],
    },
    {
        name: "Entertainment", kind: "expense", icon: "entertainment", color: "warning",
        children: [
            { name: "Movies & Events", icon: "celebration", color: "warning" },
            { name: "Travel", icon: "flight", color: "info" },
        ],
    },
    {
        name: "Healthcare", kind: "expense", icon: "health", color: "success",
        children: [
            { name: "Doctor & Hospital", icon: "medical", color: "danger" },
            { name: "Medicines", icon: "medication", color: "success" },
            { name: "Fitness", icon: "fitness", color: "accent" },
        ],
    },
    {
        name: "Income", kind: "income", icon: "income", color: "success",
        children: [
            { name: "Salary", icon: "payments", color: "success" },
            { name: "Freelance", icon: "laptop", color: "info" },
            { name: "Interest & Returns", icon: "investments", color: "accent" },
        ],
    },
    // No children on purpose: "Others" is the bucket for things that don't fit a
    // heading, so giving it headings of its own defeats the point.
    { name: "Others", kind: "expense", icon: "more", color: "gray500" },
];
