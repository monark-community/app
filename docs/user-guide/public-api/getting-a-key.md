# Getting a key

Go to **Account → API keys** and choose **New API key**. You'll set:

- **Name** : a label so you can tell keys apart later ("Zapier", "nightly sync").
- **Access** :
  - **Full access** : the key acts with everything _you_ can do.
  - **Limited** : pick a subset of your own permissions ; an ad-hoc role that
    exists only for this key. You can only pick permissions you actually hold.
- **Expiration** : optional; the key stops working after it.

When you create it, the key is shown **once** (it starts with `mrk_`). Copy it
immediately : it's stored only as a hash and can never be shown again. Lost it?
Revoke it and make a new one.

A key is always tied to **one organization** (the one you're in when you create
it) and is revocable at any time from the same page.
