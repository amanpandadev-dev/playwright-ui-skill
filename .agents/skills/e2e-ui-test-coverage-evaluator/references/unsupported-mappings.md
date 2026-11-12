# Unsupported Coverage Mappings (extract)

Reject these unsupported mappings:

- List rendering or sorting mapped to approval, and invalid rejection mapped to successful rejection.
- Inbox navigation mapped to email-link authentication and return navigation.
- Pre-sorted mock rendering mapped to backend sorting.
- An alert mapped to a real API `422` or proof that mutation was prevented.
- A success message mapped to persistence, audit writing or notification delivery.
- UI role simulation mapped to backend object/department authorization.
- A generic failure mapped to stale-version or already-actioned handling.
