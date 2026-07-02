import { DeliveryDetail } from "./delivery-detail";

export default async function AdminWebhookDeliveryPage({
  params,
}: {
  params: Promise<{ id: string; deliveryId: string }>;
}) {
  const { id, deliveryId } = await params;
  return <DeliveryDetail endpointId={id} deliveryId={deliveryId} />;
}
