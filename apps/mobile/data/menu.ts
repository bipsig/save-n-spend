import { IconName } from "@/lib/icons"

type MoreItem = {
  key: number;
  label: string;
  icon: IconName
  path: string;
}

const moreItems: MoreItem[] = [
  {
    key: 1,
    label: "Manage Budget",
    icon: "bills",
    path: "/budget"
  },
  {
    key: 2,
    label: "AI Assistant",
    icon: "chat",
    path: "/assistant"
  },
  {
    key: 3,
    label: "Bills",
    icon: "income",
    path: "/bills"
  },
  {
    key: 4,
    label: "Goals",
    icon: "savings",
    path: "/goals"
  }
];

export default moreItems;