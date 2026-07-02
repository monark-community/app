import { redirect } from "next/navigation";

export default function ProjectNewPage() {
  redirect("/projects?project=new");
}
