import { ProjectWorkspace } from "@/components/ProjectWorkspace";

export default async function ProjectPage(
  props: PageProps<"/projects/[id]">
) {
  const { id } = await props.params;

  return (
    <ProjectWorkspace projectId={id} />
  );
}
