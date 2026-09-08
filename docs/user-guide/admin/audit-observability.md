# Audit + observability

Every admin write : role assigned, role revoked, user deletion requested, organization renamed, invite sent / revoked ; emits a domain event. Today the event hits the notifications subscriber + the application logs. Phase-2 wires an admin-side audit log surface ; until then, the operator's logging stack (ELK, Sentry, etc.) is the system of record.
