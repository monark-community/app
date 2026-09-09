# Calendar : user guide

End-user guide for the Calendar module (`@monark/calendar`, an extended module). It lives with the package on purpose : remove the module and its docs go with it. It's linked from the central [user guide index](../../../docs/user-guide/_index.md) ; developer details are in the [module README](../README.md).

Reach the calendar from the **Calendar** entry in the navigation rail. What you can see and change depends on which calendars your role has access to.

## Views

A toolbar switches between four views of the same events :

- **Day** : an hour-by-hour timeline with a live "now" line.
- **Week** : seven day-columns side by side.
- **Month** : a traditional grid.
- **Agenda** : a running, scrollable list of upcoming events.

**Today** jumps back to the current date ; the arrows step forward and back by whatever the current view spans. A mini-month calendar in the sidebar lets you jump to any date. On a phone, Week and Month collapse to Day.

## Calendars

You can have several named, colour-coded calendars (e.g. "Team", "Personal", "Releases"). The sidebar lists the ones you can see ; toggle a calendar to show or hide its events. Your **personal calendar** is always there and can't be deleted.

Managing calendars (the manage dialog) (where your role permits) lets you **create** a calendar, set its **name / description / colour**, control **which roles can see it**, and archive it. Seeing a calendar is governed by role access ; full management is a separate permission.

## Creating an event

Click an empty time slot (Day / Week) or a day (Month) to open the new-event popover, and fill in :

- **Title**, **start** and **end** times, optional **location** and **participants**.
- The **calendar** it belongs to.
- The **type** : a standard timed event, an **all-day** event, or a **punctual** moment.
- One or more **reminders** (see below).

## Editing & moving events

- **Drag** an event to move it ; **drag its edges** to change its start or end. This works with a mouse and with touch.
- **Click** an event to edit its details, or to delete it.
- When a new or moved event overlaps another on the same calendar, a non-blocking **conflict banner** warns you ; it doesn't stop you, it just flags the clash.

## Reminders

Give an event one or more reminders, each a number of minutes before it starts. When a reminder is due you get an **in-app notification** (the bell) that deep-links to the day. Reminders are in-app only.

## Search

The global command palette (⌘K / Ctrl-K) finds events by title across the calendars you can see, so you can jump straight to one without scrolling.

## Import & export (ICS)

- **Export** downloads your events as a standard `.ics` file (one calendar, or everything you can see) ; import it into Google Calendar, Outlook, Apple Calendar, etc.
- **Import** reads an uploaded `.ics` file and creates the events on a calendar you choose (up to 500 at a time). Recurring events are imported as individual occurrences.

## View options

A view-options control tailors the calendar to you, and your choices are remembered : hide weekends, choose the first day of the week, set a default view, switch between 12-hour and 24-hour times, and highlight working hours. These are personal preferences ; they don't change anything for other people.

## Events that come from your data

Some events may appear that you didn't create by hand : if an admin has connected a [Data Model](../../../docs/user-guide/data/_index.md) to the calendar, records with a date field show up here automatically as events. Change the record and its event follows ; clear the date and the event disappears. You manage those through the record, not the event.
