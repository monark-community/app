# The two kinds of value

Every field on a step holds one of two things :

- **A fixed value** : you type it (or pick it from a list) and it never changes. A subject line of "Welcome!", a toggle set to on, a number like `5`.
- **A variable** : a value taken from somewhere else in the flow, resolved fresh every time the automation runs. "The user who triggered this", "the record the previous step found", "the running total so far".

A variable is written as a token in double braces, for example `{{ trigger.email }}`. You rarely type these by hand ; the editor inserts them for you (see below). Inside a field an inserted variable shows as a small highlighted **chip** rather than raw braces, so a field full of text and values stays readable ; a chip is one unit, so a single Backspace removes the whole variable. When the automation runs, each token is replaced with the real value at that moment.
