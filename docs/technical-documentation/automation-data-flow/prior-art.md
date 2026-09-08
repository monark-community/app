# Prior art

| Tool              | Data model                                                          | How you address a value                                                           | Insert UX                                                            | Control vs data                                      |
| ----------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------- |
| Unreal Blueprints | typed data **pins**, wired                                          | wire pin to pin ; named variables as Get/Set nodes ; literals on unconnected pins | drag a wire                                                          | fully separate: white exec wire vs colored data pins |
| n8n               | wire carries the item stream (`$json`) ; expressions reach sideways | `{{ $json.x }}`, `{{ $node["Find Record"].json.x }}` ; by **name**                | expression editor with autocomplete + drag-from-input-schema         | main line (data + control fused) + expressions       |
| Make              | linear route ; **every field is an expression**                     | click a token (`{{ 2.email }}`, shown with a friendly label)                      | a **mapping panel** lists all upstream outputs, click into any field | route = control ; mapping = data                     |

Two observations. First, all three separate control flow from data flow, which
Monark already does (the flow wire vs `field:` ports). Second, only Unreal wires
individual data values, and it gets away with it because it is strongly typed and
desktop-native. n8n and Make, the closest analogs to Monark, do **not** wire
fields ; every field is an expression, and upstream values come from a **picker**
that lists prior steps by **friendly name** with their **output schema**. The
winning ingredient is the picker + names + declared shapes, not the wiring.
