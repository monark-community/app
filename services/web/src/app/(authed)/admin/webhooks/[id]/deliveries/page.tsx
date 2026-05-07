import { DeliveriesList } from "./deliveries-list"

export default async function AdminWebhookDeliveriesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <DeliveriesList endpointId={id} />
}
