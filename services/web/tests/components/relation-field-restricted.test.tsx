import { describe, expect, it } from "vitest";
import { useForm, FormProvider } from "react-hook-form";
import { renderWithIntl, screen, waitFor } from "../test-utils";
import { RelationField } from "@/components/fields/inputs/relation-field";
import { useFieldStrings } from "@/components/fields/strings";
import type { RelationFieldDef, RelationOption } from "@/components/fields/types";

// A relation stores ids on the record itself, but resolving each id to a label
// goes through the permission-checked record procedures. So a viewer can hold a
// record that links to one they may not read (model permission, per-record ACL,
// or an MQL record scope).
//
// That chip used to sit on "Loading…" forever, because the id never landed in
// the label cache and the hydrate effect only re-runs when the id list changes.
// It has to say what it actually is: something is linked here, and you cannot
// see it.

function Harness({ ids, resolvable }: { ids: string[]; resolvable: string[] }) {
  const def: RelationFieldDef = {
    type: "relation",
    name: "industries",
    label: "Industries",
    multiple: true,
    source: {
      model: "industry",
      loadOptions: async () => [],
      // Mirrors the real source: ids the caller cannot read simply do not come
      // back (`getById` throws and is caught per id).
      loadByIds: async (wanted: string[]): Promise<RelationOption[]> =>
        wanted.filter((id) => resolvable.includes(id)).map((id) => ({ id, label: `Label ${id}` })),
    },
  };
  const methods = useForm({ defaultValues: { industries: ids } });
  // Real production copy, not invented labels.
  const { labels } = useFieldStrings();
  return (
    <FormProvider {...methods}>
      <RelationField def={def} labels={labels} />
    </FormProvider>
  );
}

function renderRelation(ids: string[], resolvable: string[]) {
  return renderWithIntl(<Harness ids={ids} resolvable={resolvable} />);
}

describe("<RelationField> with an unreadable target", () => {
  it("labels a resolvable link normally", async () => {
    renderRelation(["a"], ["a"]);
    await waitFor(() => expect(screen.getByText("Label a")).toBeInTheDocument());
  });

  it("says Restricted instead of hanging on Loading", async () => {
    renderRelation(["a", "b"], ["a"]);
    await waitFor(() => expect(screen.getByText("Label a")).toBeInTheDocument());
    // The unreadable one resolves to a real label, not the loading placeholder.
    await waitFor(() => expect(screen.getByText("Restricted")).toBeInTheDocument());
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("still shows the link exists, so the count is honest", async () => {
    // Two links, one readable. Hiding the second would under-report what is
    // attached to this record ; showing its title would leak it.
    const { container } = renderRelation(["a", "b"], ["a"]);
    await waitFor(() => expect(screen.getByText("Restricted")).toBeInTheDocument());
    expect(container.querySelectorAll("[title]").length).toBeGreaterThan(0);
  });
});
