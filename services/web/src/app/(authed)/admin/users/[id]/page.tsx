import { UserDetail } from "./user-detail";

// All the read state lives in the client component so the back/forward
// cache + search filters stay coherent ; the server component just pins
// the dynamic id and hands it down.
export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <UserDetail userId={id} />;
}
