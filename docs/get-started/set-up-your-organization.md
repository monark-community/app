---
type: tutorial
---

# Set up your organization

This tutorial is for the first admin of a new Monark organization. In about 15 minutes you'll secure your admin access, put your organization's name on the app, create a database for your team, make a role that can work in it, and invite a teammate into that role. The example is a small agency tracking its clients; use your own names as you go.

## Before you start

- You hold the Administrator role. If you see **Admin** at the bottom of the navigation rail (in the menu on a phone), you do. If you don't, ask whoever runs your Monark deployment.
- You have an authenticator app on your phone, and your teammate's email address.

## Turn on two-factor authentication

Admin only opens for admins who use two-factor authentication.

1. Click **Admin**. You land on your security settings under a **Two-factor required for admin access** banner.
2. Click **Set up two-factor now**. Scan the QR code with your authenticator app and click **Continue**.
3. Enter the 6-digit code the app shows and click **Confirm**.
4. Save the recovery codes somewhere outside the app, then click **I saved them**.
5. Click **Admin** again.

Admin opens on your organization's settings, with its other tabs listed beside them.

## Put your name on the app

1. In **Admin**, make sure **Organization** is open.
2. Replace the **Display name** with your organization's name.
3. Click the logo area and upload a square logo, up to 2 MB.
4. Optionally enter your **Primary brand color** as a hex code, such as `#2563EB`.
5. Click **Save changes**.

Your logo and color now appear across the app, including in the navigation rail.

## Create a data model

A data model is a database your team works in. Create one for clients.

1. Open **Data Models** and click **New Data Model**.
2. Enter "Client" as the **Name** and click **Create**. The model's editor opens, with one field already in place: the title, which will hold each client's name.
3. Under **Fields**, click **Add field**. Enter "Website" as the **Label**, choose **URL** as the **Type**, and click **Save**.
4. Click **Add field** again. Enter "Renewal date", choose **Date**, and click **Save**.

The model now has three fields. Open **Data** in the navigation rail and you'll find **Client** there, empty and ready for records.

## Create a role for your teammate

Roles decide what people can do. Make one that can read and edit clients but can't change the model itself.

1. Click **Admin**, open **Roles & permissions** and click **New role**.
2. Enter "Account manager" as the **Name**.
3. Under **Permissions**, open the **Data models** group and tick three permissions: the ones described as reading Data Model and field definitions, reading Data Records, and creating or editing Data Records.
4. Click **Create role**.

**Account manager** now appears in the list of roles, below the built-in **Administrator**.

## Invite your teammate

1. Open **Users** and click **Invite user**.
2. Enter your teammate's **Email** and, optionally, their **Full name**.
3. Choose **Account manager** as the **Role**.
4. Click **Send invite**.

The invitation appears at the top of the user list as **Pending**. Your teammate gets an email with a link that works for 14 days. Once they sign up, they appear as a regular user, can open **Client** under **Data**, and can add and edit clients.

## What you built

Your organization now carries its own name and look, has a database with a role scoped to working in it, and has a second member. Admin access is protected by two-factor authentication.

From here:

- [People and access](../administer/people-and-access/_index.md): more roles, record scopes, and managing accounts.
- [Data models](../administer/data-models/_index.md): more fields, calendar views, and public forms.
- [Integrations](../administer/integrations/_index.md): secrets, webhooks, connected services and service accounts.
- [Organization](../administer/organization/_index.md): files, achievements and an audit trail.

Point your teammate at [First steps](first-steps.md) for their own start.
