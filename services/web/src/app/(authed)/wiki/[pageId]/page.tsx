import { WikiPageView } from "../wiki-page-view";

export default async function WikiPageRoute({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  return <WikiPageView pageId={pageId} />;
}
