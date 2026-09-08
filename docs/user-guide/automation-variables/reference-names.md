# Reference names

Each step has a **reference name** ; the short handle other steps use to point at it, like `find_record` in `{{ steps.find_record.id }}`. The editor gives every step a sensible name automatically, derived from its type, and keeps them unique within the flow.

To change one, right-click the step and choose **Rename**. The dialog has two fields :

- **Display name** : the label shown on the step in the canvas. Purely cosmetic ; name two "Find record" steps "Find the buyer" and "Find the seller" to tell them apart.
- **Reference name** : the handle used in `{{ steps.… }}`. It must be unique and use only letters, numbers, and underscores. When you change it, every reference pointing at this step is updated automatically, so nothing breaks.
