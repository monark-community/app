# Achievements

`/admin/achievements`. Define the achievements users can earn and the conditions that award them. An achievement carries a name, description, icon, and point value, and can be enabled or disabled without deleting it.

Each achievement holds a list of **conditions**. A condition names a domain event to watch (`kanban.card-created`, `wiki.page-created`, and so on), how many matching events are needed, and which field of the event payload names the user to credit ; it can also carry equality matchers on the payload, so "moved a card into Done" is a different condition from "moved a card". An achievement with no conditions can never be earned, and the editor says so. Awarding is automatic from there : the module counts progress per user on the event bus, so nothing is granted by hand.

Gated by the `achievements.enabled` feature flag. The user-facing gallery is reached from the account menu, not from a nav entry.
