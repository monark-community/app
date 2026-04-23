=== # Monark App ============================================================

We want a Monark App, that is the central hub for Monark executives (admins), Monark developers (decentralized, self-onboarding, long-running relationship, retain), students (guided onboarding, relationships typically limited in time (4-8 months), hope is that they convert to developers), ambassador (Monark’s representatives in their local and digital communities).

Key features wanted by Monark executives are contributions quantification (for rewards), voting (decentralized), and integration with an existing referral system.

=== # Project Setup ==========================================================

## Modular Approach

### Core Modules

Some modules are core to almost every application;

#### Feature Flag

- Instance/deployment based feature enabling/disabling

#### Full authentication flow

- Login/Password
- Password strength validation
- Email Validation 
- Trusted Device
- TOPT Application)

#### Organization Management

- Single org / multiple org support
- Full brand customization (white-label)
- Users per organization with invite flow

#### RBAC System setup (Admin, Developer, Ambassador, Student)

- Authentication
- User Management
- Organization Management
- Feature Flags
- RBAC System

Those systems should be integrated as modules, but can be coupled together, since we don't expect to remove any of those.

### Extended, Monark-specific Modules

We want Monark-specific modules to be as independent as possible. They should be self-contained systems, that interface with the other systems through a well-defined interfaces. Each module should integrate well with our core modules, in a way that removing them doesn't break other parts of the application. Connections between Extended (Monark-specific) modules should be should not break individual modules. If a module absolutely must depend on another, we should think of a module dependency system so that they always come together. Some of those modules include;

- User Onboarding
- Voting System
- Contribution Estimation System
- Referral System


---



---


---