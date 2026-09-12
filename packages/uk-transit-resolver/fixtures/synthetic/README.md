# Synthetic fixtures

Everything in this directory is fictional: fictional town ("Fenbridge"), fictional route
("X1"), fictional operator reference ("TEST_OPERATOR"), and coordinates that do not correspond
to any real place. Nothing here is copied from a real BODS/TransXChange/SIRI-VM payload or from
any real operator's published schedule.

NaPTAN-*style* stop-code formatting (an 8-digit code prefixed by a fictional 4-digit area) is
used only to exercise the parser's expected shape — these are not real ATCO codes.

See the repository root `THIRD_PARTY_NOTICES.md` for how this package handles genuinely
real NaPTAN reference data (used with attribution, never bundled as a fixture) versus
operator-originated schedule content (never bundled, real or synthetic route/operator
identifiers only, per this directory's own policy).
