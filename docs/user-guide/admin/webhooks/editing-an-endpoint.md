# Editing an endpoint

Click any row to land on the edit page. You can change :

- URL, description, and subscriptions (same rules as create).
- **Status** ; toggle between Active and Disabled. A disabled endpoint stops receiving new deliveries but pre-existing pending rows still drain.
- **Rotate secret** ; generates a new signing secret and shows it once. The old secret becomes invalid immediately ; update your receiver before rotating.
- **Delete** ; removes the endpoint permanently.

Subscriptions that were saved in a previous deploy but no longer appear in the current event registry show as removable chips above the module groups.
