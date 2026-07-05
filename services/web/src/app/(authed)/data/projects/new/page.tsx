import { redirect } from "next/navigation";

export default function ProjectNewPage() {
  redirect("/data/projects?project=new");
}
