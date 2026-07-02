import { OrganizationDetail } from "./organization-detail";

export default async function AdminOrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrganizationDetail orgId={id} />;
}
