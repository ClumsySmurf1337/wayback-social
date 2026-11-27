"""Click command modules for wayback-social (issue #12).

cli.py stays a thin dispatcher: it owns the ``main`` group and
registers every command. Each module here owns one command (or one
small group) and imports only what it uses — nothing imports cli.
"""
