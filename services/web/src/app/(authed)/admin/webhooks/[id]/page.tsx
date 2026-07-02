import { WebhookEditor } from "../webhook-editor";

export default async function AdminWebhookEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WebhookEditor mode="edit" endpointId={id} />;
}
