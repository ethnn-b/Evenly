import Link from "next/link";
import type { Group } from "@/lib/types";

// Renders the user's groups as links into each group page. A plain (server)
// component: it only displays data passed in from the dashboard.
export default function GroupList({ groups }: { groups: Group[] }) {
  if (groups.length === 0) {
    return (
      <p className="rounded border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
        No groups yet. Create one above to get started.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
      {groups.map((group) => (
        <li key={group.id}>
          <Link
            href={`/group/${group.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
          >
            <span className="font-medium">{group.name}</span>
            <span aria-hidden className="text-gray-400">
              &rarr;
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
